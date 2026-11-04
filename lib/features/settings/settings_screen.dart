import 'package:flutter/material.dart';

import 'package:supermarket_pos/app/app_settings.dart';

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final settings = AppSettingsScope.of(context);
    final isFrench = settings.locale.languageCode == 'fr';

    String translate(String english, String french) {
      return isFrench ? french : english;
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(translate('Settings', 'Paramètres')),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            translate('General', 'Général'),
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 12),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    translate('Language', 'Langue'),
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  RadioGroup<String>(
                    groupValue: settings.locale.languageCode,
                    onChanged: (value) {
                      if (value != null) {
                        settings.setLanguage(value);
                      }
                    },
                    child: Column(
                      children: [
                        RadioListTile<String>(
                          title: const Text('English'),
                          value: 'en',
                        ),
                        RadioListTile<String>(
                          title: const Text('Français'),
                          value: 'fr',
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),

          const SizedBox(height: 16),

          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    translate('Appearance', 'Apparence'),
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 8),
                  RadioGroup<ThemeMode>(
                    groupValue: settings.themeMode,
                    onChanged: (value) {
                      if (value != null) {
                        settings.setThemeMode(value);
                      }
                    },
                    child: Column(
                      children: [
                        RadioListTile<ThemeMode>(
                          title: Text(translate('System default', 'Système')),
                          value: ThemeMode.system,
                        ),
                        RadioListTile<ThemeMode>(
                          title: Text(translate('Light', 'Clair')),
                          value: ThemeMode.light,
                        ),
                        RadioListTile<ThemeMode>(
                          title: Text(translate('Dark', 'Sombre')),
                          value: ThemeMode.dark,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}