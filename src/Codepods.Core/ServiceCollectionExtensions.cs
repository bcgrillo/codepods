using Codepods.Core.UseCases;
using Microsoft.Extensions.DependencyInjection;

namespace Codepods.Core;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddCodepodsCore(this IServiceCollection services)
    {
        services.AddScoped<AuthUseCase>();
        services.AddScoped<AgentUseCase>();
        services.AddScoped<RelayUseCase>();
        services.AddScoped<ProviderUseCase>();
        services.AddScoped<RepositoryUseCase>();
        services.AddScoped<CodepodUseCase>();
        services.AddScoped<VariableUseCase>();
        services.AddScoped<AgentFileUseCase>();
        services.AddScoped<UserDeviceUseCase>();
        services.AddScoped<SystemConfigUseCase>();
        return services;
    }
}
