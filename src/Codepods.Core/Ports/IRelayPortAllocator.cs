namespace Codepods.Core.Ports;

public interface IRelayPortAllocator
{
    int Allocate(IReadOnlyCollection<int> usedPorts);
}
