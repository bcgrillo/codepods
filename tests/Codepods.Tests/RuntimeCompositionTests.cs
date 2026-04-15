using Codepods.Core.Ports;
using Codepods.Core.Configuration;
using Codepods.Runtime;
using Codepods.Runtime.Web;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Codepods.Tests;

public sealed class RuntimeCompositionTests
{
    [Fact]
    public void RuntimeDependencyInjection_ResolvesWebHostController()
    {
        var root = Path.Combine(Path.GetTempPath(), "codepods-tests", Guid.NewGuid().ToString("N"));
        var agentTypes = Path.Combine(root, "agent-types");
        Directory.CreateDirectory(agentTypes);
        var config = CodepodsConfig.Load(root);

        var services = new ServiceCollection();
        services.AddCodepodsRuntime(config);
        using var provider = services.BuildServiceProvider();

        var webHost = provider.GetRequiredService<IWebHostController>();
        Assert.NotNull(webHost);
        Assert.IsType<DotnetWebHostController>(webHost);
    }
}
