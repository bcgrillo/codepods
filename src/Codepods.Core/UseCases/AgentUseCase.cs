using Codepods.Core.Domain;
using Codepods.Core.Ports;

namespace Codepods.Core.UseCases;

public sealed class AgentUseCase
{
    private readonly IAgentRepository _agents;
    private readonly IAgentRuntime _runtime;
    private readonly IAgentTypeCatalog _agentTypes;
    private readonly IAgentWorkspace _workspace;
    private readonly IRelayRepository _relays;

    public AgentUseCase(IAgentRepository agents, IAgentRuntime runtime, IAgentTypeCatalog agentTypes, IAgentWorkspace workspace, IRelayRepository relays)
    {
        _agents = agents;
        _runtime = runtime;
        _agentTypes = agentTypes;
        _workspace = workspace;
        _relays = relays;
    }

    public async Task<IReadOnlyList<AgentRuntimeView>> ListAsync(CancellationToken ct = default)
    {
        var rows = await _agents.ListAsync(ct);
        var runtimeMap = await _runtime.ListRuntimeStatusesAsync(ct);
        return rows
            .Select(agent => new AgentRuntimeView(
                agent.Id,
                agent.Name,
                agent.AgentType,
                agent.Status,
                agent.MetadataJson,
                runtimeMap.TryGetValue(agent.Name, out var status) ? status : null))
            .ToList();
    }

    public IReadOnlyList<AgentTypeInfo> ListTypes() => _agentTypes.ListTypes();

    public Task<string> NextNameAsync(CancellationToken ct = default) => _workspace.NextAgentNameAsync(ct);

    public Task<IReadOnlyList<string>> ListTrashAsync(CancellationToken ct = default) => _workspace.ListTrashAsync(ct);

    public Task<bool> HasTrashAsync(string name, CancellationToken ct = default) => _workspace.HasTrashAsync(name, ct);

    public async Task<AgentRuntimeView> CreateAsync(string? name, string agentType, string? metadataJson, bool restore = false, CancellationToken ct = default)
    {
        var normalizedName = (name ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            normalizedName = await _workspace.NextAgentNameAsync(ct);
        }
        if (string.IsNullOrWhiteSpace(normalizedName))
        {
            throw new InvalidOperationException("Agent name is required.");
        }
        var normalizedType = agentType.Trim();
        if (string.IsNullOrWhiteSpace(normalizedType))
        {
            throw new InvalidOperationException("Agent type is required.");
        }
        if (!_agentTypes.Exists(normalizedType))
        {
            throw new InvalidOperationException($"Unknown agent type: {normalizedType}");
        }

        var existing = await _agents.GetByNameAsync(normalizedName, ct);
        if (existing is not null)
        {
            throw new InvalidOperationException($"Agent already exists: {normalizedName}");
        }

        var effectiveMetadata = string.IsNullOrWhiteSpace(metadataJson)
            ? _agentTypes.LoadMetadataJson(normalizedType)
            : metadataJson;

        await _runtime.CreateAgentAsync(normalizedName, normalizedType, restore, ct);
        var created = await _agents.AddAsync(new Agent
        {
            Name = normalizedName,
            AgentType = normalizedType,
            Status = AgentStatus.Running,
            MetadataJson = string.IsNullOrWhiteSpace(effectiveMetadata) ? "{}" : effectiveMetadata
        }, ct);

        return new AgentRuntimeView(created.Id, created.Name, created.AgentType, created.Status, created.MetadataJson, "running");
    }

    public async Task<AgentRuntimeView> WakeAsync(int agentId, CancellationToken ct = default)
    {
        var agent = await _agents.GetByIdAsync(agentId, ct)
            ?? throw new InvalidOperationException($"Agent not found: {agentId}");
        await _runtime.WakeAgentAsync(agent.Name, ct);
        agent.Status = AgentStatus.Running;
        agent.UpdatedAtUtc = DateTime.UtcNow;
        await _agents.UpdateAsync(agent, ct);
        return new AgentRuntimeView(agent.Id, agent.Name, agent.AgentType, agent.Status, agent.MetadataJson, "running");
    }

    public async Task<AgentRuntimeView> SleepAsync(int agentId, CancellationToken ct = default)
    {
        var agent = await _agents.GetByIdAsync(agentId, ct)
            ?? throw new InvalidOperationException($"Agent not found: {agentId}");
        await _runtime.SleepAgentAsync(agent.Name, ct);
        agent.Status = AgentStatus.Stopped;
        agent.UpdatedAtUtc = DateTime.UtcNow;
        await _agents.UpdateAsync(agent, ct);
        return new AgentRuntimeView(agent.Id, agent.Name, agent.AgentType, agent.Status, agent.MetadataJson, "exited");
    }

    public async Task RemoveAsync(int agentId, CancellationToken ct = default)
    {
        var agent = await _agents.GetByIdAsync(agentId, ct)
            ?? throw new InvalidOperationException($"Agent not found: {agentId}");
        await _runtime.RemoveAgentAsync(agent.Name, ct);
        await _workspace.MoveToTrashAsync(agent.Name, ct);
        await _relays.DeleteByAgentAsync(agentId, ct);
        await _agents.DeleteAsync(agentId, ct);
    }
}

public sealed record AgentRuntimeView(
    int Id,
    string Name,
    string AgentType,
    AgentStatus Status,
    string MetadataJson,
    string? RuntimeStatus
);
