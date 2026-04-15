using Codepods.Core.Ports;

namespace Codepods.Infrastructure.Relay;

public sealed class RelayPortAllocator : IRelayPortAllocator
{
    private readonly int _minPort;
    private readonly int _maxPort;

    public RelayPortAllocator(int minPort, int maxPort)
    {
        _minPort = minPort;
        _maxPort = maxPort;
    }

    public int Allocate(IReadOnlyCollection<int> usedPorts)
    {
        if (_minPort <= 0 || _maxPort < _minPort)
        {
            throw new InvalidOperationException("Invalid relay port range.");
        }

        for (var port = _minPort; port <= _maxPort; port++)
        {
            if (!usedPorts.Contains(port))
            {
                return port;
            }
        }

        throw new InvalidOperationException("No relay ports available.");
    }
}
