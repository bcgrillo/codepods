using Codepods.Core.Domain;
using Codepods.Core.Ports;
using Codepods.Core.UseCases;
using Xunit;

namespace Codepods.Tests;

public sealed class AgentUseCaseTests
{
    [Fact]
    public async Task Create_UsesWorkspaceName_AndPersistsAgent()
    {
        var agents = new InMemoryAgentRepository();
        var runtime = new FakeAgentRuntime();
        var catalog = new FakeAgentTypeCatalog();
        var workspace = new FakeAgentWorkspace { NextName = "agente-1" };
        var relays = new FakeRelayRepository();
        var useCase = new AgentUseCase(agents, runtime, catalog, workspace, relays);

        var created = await useCase.CreateAsync(null, "opencode", null, restore: false);

        Assert.Equal("agente-1", created.Name);
        Assert.Equal("opencode", created.AgentType);
        Assert.Equal(AgentStatus.Running, created.Status);
        Assert.Equal("running", created.RuntimeStatus);
        Assert.Contains("agente-1", runtime.CreatedNames);
        var stored = await agents.GetByNameAsync("agente-1");
        Assert.NotNull(stored);
    }

    [Fact]
    public async Task WakeSleepRemove_ConvergesRuntimeAndRepository()
    {
        var agents = new InMemoryAgentRepository();
        var runtime = new FakeAgentRuntime();
        var catalog = new FakeAgentTypeCatalog();
        var workspace = new FakeAgentWorkspace();
        var relays = new FakeRelayRepository();
        var useCase = new AgentUseCase(agents, runtime, catalog, workspace, relays);
        var created = await useCase.CreateAsync("agent-x", "opencode", null);

        await useCase.SleepAsync(created.Id);
        var afterSleep = await agents.GetByIdAsync(created.Id);
        Assert.NotNull(afterSleep);
        Assert.Equal(AgentStatus.Stopped, afterSleep!.Status);
        Assert.Contains("agent-x", runtime.SleptNames);

        await useCase.WakeAsync(created.Id);
        var afterWake = await agents.GetByIdAsync(created.Id);
        Assert.NotNull(afterWake);
        Assert.Equal(AgentStatus.Running, afterWake!.Status);
        Assert.Contains("agent-x", runtime.WokenNames);

        await useCase.RemoveAsync(created.Id);
        Assert.Contains("agent-x", runtime.RemovedNames);
        Assert.Contains("agent-x", workspace.MovedToTrashNames);
        var deleted = await agents.GetByIdAsync(created.Id);
        Assert.Null(deleted);
    }
}

file sealed class FakeRelayRepository : IRelayRepository
{
    public Task<IReadOnlyList<RelayBinding>> ListAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<RelayBinding>>(Array.Empty<RelayBinding>());

    public Task<IReadOnlyList<RelayBinding>> ListByAgentAsync(int agentId, CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<RelayBinding>>(Array.Empty<RelayBinding>());

    public Task<RelayBinding?> GetAsync(int relayId, CancellationToken ct = default)
        => Task.FromResult<RelayBinding?>(null);

    public Task<RelayBinding?> GetByAgentAndKindAsync(int agentId, string serviceKind, CancellationToken ct = default)
        => Task.FromResult<RelayBinding?>(null);

    public Task<RelayBinding> AddAsync(RelayBinding relay, CancellationToken ct = default)
        => Task.FromResult(relay);

    public Task<RelayBinding> UpdateAsync(RelayBinding relay, CancellationToken ct = default)
        => Task.FromResult(relay);

    public Task DeleteByAgentAsync(int agentId, CancellationToken ct = default)
        => Task.CompletedTask;
}

file sealed class InMemoryAgentRepository : IAgentRepository
{
    private readonly List<Agent> _rows = new();
    private int _id = 1;

    public Task<IReadOnlyList<Agent>> ListAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<Agent>>(_rows.Select(Clone).ToList());

    public Task<Agent?> GetByIdAsync(int id, CancellationToken ct = default)
        => Task.FromResult(_rows.FirstOrDefault(x => x.Id == id) is { } found ? Clone(found) : null);

    public Task<Agent?> GetByNameAsync(string name, CancellationToken ct = default)
        => Task.FromResult(_rows.FirstOrDefault(x => x.Name == name) is { } found ? Clone(found) : null);

    public Task<Agent> AddAsync(Agent agent, CancellationToken ct = default)
    {
        var copy = Clone(agent);
        copy.Id = _id++;
        _rows.Add(copy);
        return Task.FromResult(Clone(copy));
    }

    public Task<Agent> UpdateAsync(Agent agent, CancellationToken ct = default)
    {
        var idx = _rows.FindIndex(x => x.Id == agent.Id);
        if (idx < 0)
        {
            throw new InvalidOperationException("Agent not found");
        }

        _rows[idx] = Clone(agent);
        return Task.FromResult(Clone(_rows[idx]));
    }

    public Task DeleteAsync(int id, CancellationToken ct = default)
    {
        _rows.RemoveAll(x => x.Id == id);
        return Task.CompletedTask;
    }

    private static Agent Clone(Agent row) => new()
    {
        Id = row.Id,
        Name = row.Name,
        AgentType = row.AgentType,
        Status = row.Status,
        MetadataJson = row.MetadataJson,
        CreatedAtUtc = row.CreatedAtUtc,
        UpdatedAtUtc = row.UpdatedAtUtc
    };
}

file sealed class FakeAgentRuntime : IAgentRuntime
{
    public List<string> CreatedNames { get; } = new();
    public List<string> WokenNames { get; } = new();
    public List<string> SleptNames { get; } = new();
    public List<string> RemovedNames { get; } = new();

    public Task<IDictionary<string, string>> ListRuntimeStatusesAsync(CancellationToken ct = default)
        => Task.FromResult<IDictionary<string, string>>(new Dictionary<string, string>());

    public Task CreateAgentAsync(string name, string agentType, bool restore = false, CancellationToken ct = default)
    {
        CreatedNames.Add(name);
        return Task.CompletedTask;
    }

    public Task WakeAgentAsync(string name, CancellationToken ct = default)
    {
        WokenNames.Add(name);
        return Task.CompletedTask;
    }

    public Task SleepAgentAsync(string name, CancellationToken ct = default)
    {
        SleptNames.Add(name);
        return Task.CompletedTask;
    }

    public Task RemoveAgentAsync(string name, CancellationToken ct = default)
    {
        RemovedNames.Add(name);
        return Task.CompletedTask;
    }
}

file sealed class FakeAgentTypeCatalog : IAgentTypeCatalog
{
    public bool Exists(string agentType) => agentType == "opencode" || agentType == "copilot";

    public string LoadMetadataJson(string agentType) => """{"services":[{"kind":"ttyd","port":"7681"}]}""";

    public IReadOnlyList<AgentTypeInfo> ListTypes()
        => new[] { new AgentTypeInfo("opencode", "OpenCode", "image:latest", null, null, null) };

    public IReadOnlyList<TemplateInfo> ListTemplates()
        => new[] { new TemplateInfo("shared", "shared", true, null, null, null) };
}

file sealed class FakeAgentWorkspace : IAgentWorkspace
{
    public string NextName { get; set; } = "agente-1";
    public HashSet<string> Trash { get; } = new(StringComparer.Ordinal);
    public List<string> MovedToTrashNames { get; } = new();

    public Task<string> NextAgentNameAsync(CancellationToken ct = default) => Task.FromResult(NextName);

    public Task<IReadOnlyList<string>> ListTrashAsync(CancellationToken ct = default)
        => Task.FromResult<IReadOnlyList<string>>(Trash.OrderBy(x => x).ToList());

    public Task<bool> HasTrashAsync(string name, CancellationToken ct = default)
        => Task.FromResult(Trash.Contains(name));

    public Task RestoreTrashAsync(string name, CancellationToken ct = default)
    {
        Trash.Remove(name);
        return Task.CompletedTask;
    }

    public Task MoveToTrashAsync(string name, CancellationToken ct = default)
    {
        MovedToTrashNames.Add(name);
        Trash.Add(name);
        return Task.CompletedTask;
    }
}
