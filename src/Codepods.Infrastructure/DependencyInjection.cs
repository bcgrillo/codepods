using Codepods.Core.Ports;
using Codepods.Infrastructure.Persistence;
using Codepods.Infrastructure.Relay;
using Codepods.Infrastructure.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Codepods.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddCodepodsInfrastructure(
        this IServiceCollection services,
        string sqlitePath,
        int relayPortMin,
        int relayPortMax)
    {
        services.AddDbContext<CodepodsDbContext>(options =>
        {
            options.UseSqlite($"Data Source={sqlitePath}");
        });

        services.AddScoped<IAgentRepository, AgentRepository>();
        services.AddScoped<IRelayRepository, RelayRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IDeviceRepository, DeviceRepository>();
        services.AddScoped<IProviderRepository, ProviderRepository>();
        services.AddScoped<IRepositoryRepository, RepositoryRepository>();
        services.AddScoped<ICodepodRepository, CodepodRepository>();
        services.AddScoped<IVariableRepository, VariableRepository>();
        services.AddScoped<IRelayPortAllocator>(_ => new RelayPortAllocator(relayPortMin, relayPortMax));
        return services;
    }
}
