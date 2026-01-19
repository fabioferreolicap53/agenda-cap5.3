
const { createClient } = require('@supabase/supabase-js');

// Load env vars manually for the script since it's running outside Vite
const SUPABASE_URL = 'https://caewvgvtaysljqilprci.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UF08LsX_VmypeSVb2uduqA_0xCWXxvX';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function inspectProfiles() {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching profiles:', error);
    } else {
        console.log('Profile Data Sample:', JSON.stringify(data, null, 2));
    }
}

inspectProfiles();
