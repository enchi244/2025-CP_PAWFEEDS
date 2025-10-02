using PawfeedsProvisioner.Pages;

namespace PawfeedsProvisioner
{
    public partial class AppShell : Shell
    {
        public AppShell()
        {
            InitializeComponent();

            // Register routes for pages that are not part of the shell's tab/flyout structure
            Routing.RegisterRoute(nameof(FindDevicePage), typeof(FindDevicePage)); // Already correct, but good for consistency
            Routing.RegisterRoute(nameof(ConnectToDevicePage), typeof(ConnectToDevicePage));
            Routing.RegisterRoute(nameof(EnterCredentialsPage), typeof(EnterCredentialsPage));
            Routing.RegisterRoute(nameof(ProvisioningPage), typeof(ProvisioningPage));
            Routing.RegisterRoute(nameof(ConfirmationPage), typeof(ConfirmationPage));
            Routing.RegisterRoute(nameof(DashboardPage), typeof(DashboardPage));

        }
    }
}