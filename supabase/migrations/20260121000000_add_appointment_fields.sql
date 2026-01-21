
-- Add location_text and organizer_only columns to appointments table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'location_text') THEN
        ALTER TABLE appointments ADD COLUMN location_text TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'appointments' AND column_name = 'organizer_only') THEN
        ALTER TABLE appointments ADD COLUMN organizer_only BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
