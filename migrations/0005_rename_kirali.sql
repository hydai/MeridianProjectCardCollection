-- Rename the official character spelling from the old local typo to Kirali.
UPDATE card_catalog SET character = 'Kirali' WHERE character LIKE 'Kira_i';
