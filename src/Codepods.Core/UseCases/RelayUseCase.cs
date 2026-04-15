using Codepods.Core.Domain;
using Codepods.Core.Ports;

namespace Codepods.Core.UseCases;

public sealed class RelayUseCase
{
    private readonly IRelayRepository _relays;
    private readonly IAgentRepository _agents;
    private readonly IRelayPortAllocator _portAllocator;

    public RelayUseCase(IRelayRepository relays, IAgentRepository agents, IRelayPortAllocator portAllocator)
    {
        _relays = relays;
        _agents = agents;
        _portAllocator = portAllocator;
    }

    public Task<IReadOnlyList<RelayBinding>> ListAsync(CancellationToken ct = default) => _relays.ListAsync(ct);

    public async Task<RelayBinding> EnsureAsync(int agentId, string serviceKind, CancellationToken ct = default)
    {
        var agent = await _agents.GetByIdAsync(agentId, ct)
            ?? throw new InvalidOperationException($"Agent not found: {agentId}");
        var normalizedKind = serviceKind.Trim().ToLowerInvariant();
        if (string.IsNullOrWhiteSpace(normalizedKind))
        {
            throw new InvalidOperationException("serviceKind is required.");
        }

        var targetPort = ResolveTargetPort(agent, normalizedKind);
        var existing = await _relays.GetByAgentAndKindAsync(agentId, normalizedKind, ct);
        if (existing is not null)
        {
            existing.Enabled = true;
            existing.TargetPort = targetPort;
            existing.UpdatedAtUtc = DateTime.UtcNow;
            return await _relays.UpdateAsync(existing, ct);
        }

        // RelayPort has a unique index at DB level regardless of Enabled flag.
        // Reserve ports used by both active and disabled relays to avoid DB conflicts.
        var usedPorts = (await _relays.ListAsync(ct))
            .Select(row => row.RelayPort)
            .ToHashSet();
        var relayPort = _portAllocator.Allocate(usedPorts);

        return await _relays.AddAsync(new RelayBinding
        {
            AgentId = agentId,
            ServiceKind = normalizedKind,
            TargetPort = targetPort,
            RelayPort = relayPort,
            Enabled = true
        }, ct);
    }

    public async Task<RelayBinding> DisableAsync(int relayId, CancellationToken ct = default)
    {
        var relay = await _relays.GetAsync(relayId, ct)
            ?? throw new InvalidOperationException($"Relay not found: {relayId}");
        relay.Enabled = false;
        relay.UpdatedAtUtc = DateTime.UtcNow;
        return await _relays.UpdateAsync(relay, ct);
    }

    private static int ResolveTargetPort(Agent agent, string serviceKind)
    {
        foreach (var row in agent.Services())
        {
            if (string.Equals(row.Id, serviceKind, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(row.Kind, serviceKind, StringComparison.OrdinalIgnoreCase))
            {
                return row.Port;
            }
        }

        throw new InvalidOperationException($"Service kind not found for agent: {serviceKind}");
    }
}
