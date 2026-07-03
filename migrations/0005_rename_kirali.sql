-- Rename the official character spelling from the old local typo Kirari to Kirali.
UPDATE card_catalog SET character = 'Kirali' WHERE character = 'Kirari';
