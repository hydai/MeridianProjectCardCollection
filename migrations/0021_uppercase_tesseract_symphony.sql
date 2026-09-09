-- Normalize the series name while retaining catalog IDs and their references.
UPDATE series
SET name = 'TESSERACT SYMPHONY'
WHERE name = 'Tesseract Symphony';

UPDATE card_catalog
SET series = 'TESSERACT SYMPHONY'
WHERE series = 'Tesseract Symphony';

UPDATE openings
SET series = 'TESSERACT SYMPHONY'
WHERE series = 'Tesseract Symphony';
