-- Fix deletion error: allow location_id to be set to NULL when a location is deleted
ALTER TABLE IF EXISTS appointments 
DROP CONSTRAINT IF EXISTS appointments_location_id_fkey,
ADD CONSTRAINT appointments_location_id_fkey 
FOREIGN KEY (location_id) 
REFERENCES locations(id) 
ON DELETE SET NULL;
