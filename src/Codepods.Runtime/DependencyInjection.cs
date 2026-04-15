using Codepods.Core.Ports;
using Codepods.Core.Configuration;
using Codepods.Runtime.Catalog;
using Codepods.Runtime.Docker;
using Codepods.Runtime.FileSystem;
using Codepods.Runtime.Web;
using Microsoft.Extensions.DependencyInjection;

namespace Codepods.Runtime;

public static class DependencyInjection
{
    public static IServiceCollection AddCodepodsRuntime(this IServiceCollection services, CodepodsConfig config)
    {
        services.AddSingleton<IFileSystem, SystemFileSystem>();
        services.AddScoped<IAgentRuntime>(sp => new DockerAgentRuntime(
            config,
            sp.GetRequiredService<IFileSystem>(),
            sp.GetRequiredService<IVariableRepository>()));
        services.AddSingleton<IAgentTypeCatalog>(sp => new FileSystemAgentTypeCatalog(config.App.AgentTypesPath, sp.GetRequiredService<IFileSystem>()));
        services.AddSingleton<IAgentTypeFileStore>(sp => new FileSystemAgentTypeFileStore(config.App.AgentTypesPath, sp.GetRequiredService<IFileSystem>()));
        services.AddSingleton<IAgentWorkspace>(sp => new FileSystemAgentWorkspace(config, sp.GetRequiredService<IFileSystem>()));
        services.AddSingleton<IWebHostController>(_ => new DotnetWebHostController(config));
        return services;
    }
}
