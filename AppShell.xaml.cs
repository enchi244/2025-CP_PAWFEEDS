<<<<<<< HEAD
﻿using PawfeedsProvisioner.Pages;

namespace PawfeedsProvisioner
{
    public partial class AppShell : Shell
    {
        public AppShell()
        {
            InitializeComponent();

            // Nameof-based routes
            Routing.RegisterRoute(nameof(FindDevicePage), typeof(FindDevicePage));
            Routing.RegisterRoute(nameof(ConnectToDevicePage), typeof(ConnectToDevicePage));
            Routing.RegisterRoute(nameof(EnterCredentialsPage), typeof(EnterCredentialsPage));
            Routing.RegisterRoute(nameof(ProvisioningPage), typeof(ProvisioningPage));
            Routing.RegisterRoute(nameof(ConfirmationPage), typeof(ConfirmationPage));
            Routing.RegisterRoute(nameof(DashboardPage), typeof(DashboardPage));
            Routing.RegisterRoute(nameof(LoginPage), typeof(LoginPage));
            Routing.RegisterRoute(nameof(ScanNetworksPage), typeof(ScanNetworksPage));

            // Short alias routes (for paths like "//connect", "//scan", etc.)
            Routing.RegisterRoute("connect", typeof(ConnectToDevicePage));  // <-- added
            Routing.RegisterRoute("scan", typeof(ScanNetworksPage));
            Routing.RegisterRoute("find", typeof(FindDevicePage));
            Routing.RegisterRoute("provision", typeof(ProvisioningPage));
            Routing.RegisterRoute("done", typeof(ConfirmationPage));
            Routing.RegisterRoute("login", typeof(LoginPage));
        }
    }
}
=======
﻿using PawfeedsProvisioner.Pages;

namespace PawfeedsProvisioner
{
    public partial class AppShell : Shell
    {
        public AppShell()
        {
            InitializeComponent();

            // Nameof-based routes
            Routing.RegisterRoute(nameof(FindDevicePage), typeof(FindDevicePage));
            Routing.RegisterRoute(nameof(ConnectToDevicePage), typeof(ConnectToDevicePage));
            Routing.RegisterRoute(nameof(EnterCredentialsPage), typeof(EnterCredentialsPage));
            Routing.RegisterRoute(nameof(ProvisioningPage), typeof(ProvisioningPage));
            Routing.RegisterRoute(nameof(ConfirmationPage), typeof(ConfirmationPage));
            Routing.RegisterRoute(nameof(DashboardPage), typeof(DashboardPage));
            Routing.RegisterRoute(nameof(LoginPage), typeof(LoginPage));
            Routing.RegisterRoute(nameof(ScanNetworksPage), typeof(ScanNetworksPage));

            // Short alias routes (for paths like "//connect", "//scan", etc.)
            Routing.RegisterRoute("connect", typeof(ConnectToDevicePage));  // <-- added
            Routing.RegisterRoute("scan", typeof(ScanNetworksPage));
            Routing.RegisterRoute("find", typeof(FindDevicePage));
            Routing.RegisterRoute("provision", typeof(ProvisioningPage));
            Routing.RegisterRoute("done", typeof(ConfirmationPage));
            Routing.RegisterRoute("login", typeof(LoginPage));
        }
    }
}
>>>>>>> c44f57a (Initial commit without bin and obj)
