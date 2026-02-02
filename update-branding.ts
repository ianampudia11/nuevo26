import 'dotenv/config';
import { storage } from './server/storage';

async function updateBranding() {
    try {
        console.log('Updating branding settings...');

        const brandingSettings = {
            name: 'Iawarrior tech',
            company: 'Iawarrior tech',
            // Keeping existing logo/favicon if possible, or we could fetch them first.
            // For now, we'll just update the name which is stored in the 'branding' key usually as a JSON object
            // or separate keys. Based on server/routes.ts, it looks for 'branding', 'branding_logo', 'branding_favicon'.
            // Let's see what the current value is first.
        };

        // Fetch current settings to preserve other fields if any
        const current = await storage.getAppSetting('branding');
        let newValue = current ? current.value : {};

        // Update name
        const existingValue = (typeof newValue === 'object' && newValue !== null) ? newValue : {};
        newValue = { ...existingValue, name: 'Iawarrior tech', company: 'Iawarrior tech' };

        await storage.saveAppSetting('branding', newValue);
        console.log('Branding updated successfully:', newValue);

        process.exit(0);
    } catch (error) {
        console.error('Error updating branding:', error);
        process.exit(1);
    }
}

updateBranding();
