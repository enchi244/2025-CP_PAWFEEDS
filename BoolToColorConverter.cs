<<<<<<< HEAD
using System.Globalization;

namespace PawfeedsProvisioner;

public class BoolToColorConverter : IValueConverter
{
    // Provide default values to resolve the CS8618 warning.
    public Color TrueColor { get; set; } = Colors.Transparent;
    public Color FalseColor { get; set; } = Colors.Transparent;

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return (value is bool val && val) ? TrueColor : FalseColor;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
=======
using System.Globalization;

namespace PawfeedsProvisioner;

public class BoolToColorConverter : IValueConverter
{
    // Provide default values to resolve the CS8618 warning.
    public Color TrueColor { get; set; } = Colors.Transparent;
    public Color FalseColor { get; set; } = Colors.Transparent;

    public object Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        return (value is bool val && val) ? TrueColor : FalseColor;
    }

    public object ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        throw new NotImplementedException();
    }
>>>>>>> c44f57a (Initial commit without bin and obj)
}