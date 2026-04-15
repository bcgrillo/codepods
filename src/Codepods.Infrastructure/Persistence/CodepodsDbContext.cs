using Codepods.Core.Domain;
using Microsoft.EntityFrameworkCore;

namespace Codepods.Infrastructure.Persistence;

public sealed class CodepodsDbContext : DbContext
{
    public CodepodsDbContext(DbContextOptions<CodepodsDbContext> options) : base(options)
    {
    }

    public DbSet<Agent> Agents => Set<Agent>();
    public DbSet<RelayBinding> RelayBindings => Set<RelayBinding>();
    public DbSet<User> Users => Set<User>();
    public DbSet<AuthorizedDevice> AuthorizedDevices => Set<AuthorizedDevice>();
    public DbSet<Provider> Providers => Set<Provider>();
    public DbSet<Repository> Repositories => Set<Repository>();
    public DbSet<Codepod> Codepods => Set<Codepod>();
    public DbSet<Variable> Variables => Set<Variable>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Agent>(entity =>
        {
            entity.ToTable("agent");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.Name).IsUnique();
            entity.Property(x => x.Name).HasColumnName("name");
            entity.Property(x => x.AgentType).HasColumnName("agent_type");
            entity.Property(x => x.Status).HasColumnName("status").HasConversion<string>();
            entity.Property(x => x.MetadataJson).HasColumnName("metadata");
            entity.Property(x => x.CreatedAtUtc).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAtUtc).HasColumnName("updated_at");
        });

        modelBuilder.Entity<RelayBinding>(entity =>
        {
            entity.ToTable("relay_binding");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.RelayPort).IsUnique();
            entity.HasIndex(x => new { x.AgentId, x.ServiceKind }).IsUnique();
            entity.Property(x => x.AgentId).HasColumnName("agent_id");
            entity.Property(x => x.ServiceKind).HasColumnName("service_kind");
            entity.Property(x => x.TargetPort).HasColumnName("target_port");
            entity.Property(x => x.RelayPort).HasColumnName("relay_port");
            entity.Property(x => x.Enabled).HasColumnName("enabled");
            entity.Property(x => x.CreatedAtUtc).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAtUtc).HasColumnName("updated_at");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.ToTable("user");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.Username).IsUnique();
            entity.Property(x => x.Username).HasColumnName("username");
            entity.Property(x => x.PasswordHash).HasColumnName("password_hash");
            entity.Property(x => x.IsSuperadmin).HasColumnName("is_superadmin");
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAtUtc).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAtUtc).HasColumnName("updated_at");
        });

        modelBuilder.Entity<AuthorizedDevice>(entity =>
        {
            entity.ToTable("authorized_device");
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => new { x.UserId, x.DeviceFingerprint }).IsUnique();
            entity.Property(x => x.UserId).HasColumnName("user_id");
            entity.Property(x => x.Name).HasColumnName("name");
            entity.Property(x => x.DeviceFingerprint).HasColumnName("device_fingerprint");
            entity.Property(x => x.CreatedAtUtc).HasColumnName("created_at");
            entity.Property(x => x.LastSeenAtUtc).HasColumnName("last_seen_at");
            entity.Property(x => x.RevokedAtUtc).HasColumnName("revoked_at");
        });

        modelBuilder.Entity<Provider>(entity =>
        {
            entity.ToTable("provider");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasColumnName("name");
            entity.Property(x => x.ProviderType).HasColumnName("provider_type").HasConversion<string>();
            entity.Property(x => x.ConfigurationJson).HasColumnName("configuration");
            entity.Property(x => x.CreatedAtUtc).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAtUtc).HasColumnName("updated_at");
        });

        modelBuilder.Entity<Repository>(entity =>
        {
            entity.ToTable("repository");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasColumnName("name");
            entity.Property(x => x.Url).HasColumnName("url");
            entity.Property(x => x.Description).HasColumnName("description");
            entity.Property(x => x.CreatedAtUtc).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAtUtc).HasColumnName("updated_at");
        });

        modelBuilder.Entity<Codepod>(entity =>
        {
            entity.ToTable("codepod");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasColumnName("name");
            entity.Property(x => x.Description).HasColumnName("description");
            entity.Property(x => x.CreatedAtUtc).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAtUtc).HasColumnName("updated_at");
        });

        modelBuilder.Entity<Variable>(entity =>
        {
            entity.ToTable("variable");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Name).HasColumnName("name");
            entity.Property(x => x.Value).HasColumnName("value");
            entity.Property(x => x.IsSecret).HasColumnName("is_secret");
            entity.Property(x => x.CodepodId).HasColumnName("codepod_id");
            entity.Property(x => x.CreatedAtUtc).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAtUtc).HasColumnName("updated_at");
        });
    }
}
