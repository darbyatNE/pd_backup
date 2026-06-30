-- =============================================================================
-- Insert marketplace generation projects for ERCOT, MISO and SPP (SWPP), plus
-- their unbundled Capacity / Energy / REC detail. New rows (INSERT), matched by
-- name for idempotency. Run the whole file at once.
--   Status "Available" → expected_cod NULL; "Est <Mon YYYY>" → 1st of month.
--   LDA == Zone (single zone column). Energy MWh → energy_mwh_max.
--   RECs: renewables 100% w/ tracking agency; gas/nuclear → no REC product (—).
--   Term "—" → NULL. iso drives the Map ISO toggle filter.
-- =============================================================================

-- Allow ERCOT + MIRECS tracking systems (M-RETS already allowed).
ALTER TABLE planning.project_products DROP CONSTRAINT IF EXISTS project_products_retiring_agency_chk;
ALTER TABLE planning.project_products ADD CONSTRAINT project_products_retiring_agency_chk CHECK (
  retiring_agency IS NULL OR retiring_agency IN
    ('PJM-EIS GATS', 'M-RETS', 'NYGATS', 'NC-RETS', 'NEPOOL GIS', 'NAR', 'ERCOT', 'MIRECS')
);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'site_contracts_retiring_agency_chk') THEN
    ALTER TABLE public.site_contracts DROP CONSTRAINT site_contracts_retiring_agency_chk;
  END IF;
  ALTER TABLE public.site_contracts ADD CONSTRAINT site_contracts_retiring_agency_chk CHECK (
    retiring_agency IS NULL OR retiring_agency IN
      ('PJM-EIS GATS', 'M-RETS', 'NYGATS', 'NC-RETS', 'NEPOOL GIS', 'NAR', 'ERCOT', 'MIRECS')
  );
END $$;

BEGIN;

CREATE TEMP TABLE _iso_seed (
  name text, gtype text, cap numeric, zone text, hourly numeric, iso text,
  cod date, tstart date, tend date, rec_agency text
) ON COMMIT DROP;

INSERT INTO _iso_seed (name, gtype, cap, zone, hourly, iso, cod, tstart, tend, rec_agency) VALUES
  -- ── ERCOT ──────────────────────────────────────────────────────────────────
  ('West Texas Wind','Wind',200,'WZ',70,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('Houston Peaker I','Peaker',100,'HZ',10,'ERCOT',NULL,DATE '2027-06-01',DATE '2042-06-01',NULL),
  ('Panhandle Solar','Solar',150,'NZ',30,'ERCOT',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','ERCOT'),
  ('Gulf Coast CCGT','Combined Cycle',600,'HZ',360,'ERCOT',DATE '2026-09-01',DATE '2028-09-01',DATE '2048-09-01',NULL),
  ('South Texas Solar','Solar',250,'SZ',50,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('Permian Basin Hybrid','Hybrid',50,'WZ',12.5,'ERCOT',DATE '2026-11-01',DATE '2027-11-01',DATE '2042-11-01','ERCOT'),
  ('Dallas Metro Peaker','Peaker',50,'NZ',5,'ERCOT',NULL,DATE '2027-05-01',DATE '2037-05-01',NULL),
  ('Matagorda Wind','Wind',300,'SZ',105,'ERCOT',DATE '2027-01-01',DATE '2029-01-01',DATE '2049-01-01','ERCOT'),
  ('Comanche Peak SMR','Nuclear',300,'NZ',285,'ERCOT',DATE '2030-05-01',DATE '2032-05-01',DATE '2057-05-01',NULL),
  ('Brazos Valley Solar','Solar',100,'HZ',20,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('Llano Estacado Wind','Wind',150,'WZ',52.5,'ERCOT',DATE '2026-07-01',DATE '2028-07-01',DATE '2048-07-01','ERCOT'),
  ('Corpus Christi Solar','Solar',200,'SZ',40,'ERCOT',DATE '2026-10-01',DATE '2027-10-01',DATE '2042-10-01','ERCOT'),
  ('Odessa Wind Farm','Wind',220,'WZ',77,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('Galveston Peaker','Peaker',80,'HZ',8,'ERCOT',DATE '2027-03-01',DATE '2028-03-01',DATE '2043-03-01',NULL),
  ('Amarillo Solar','Solar',120,'NZ',24,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('Laredo Hybrid','Hybrid',60,'SZ',15,'ERCOT',DATE '2026-12-01',DATE '2027-12-01',DATE '2042-12-01','ERCOT'),
  ('Fort Worth CCGT','Combined Cycle',500,'NZ',300,'ERCOT',DATE '2027-06-01',DATE '2029-06-01',DATE '2049-06-01',NULL),
  ('Pecos County Wind','Wind',180,'WZ',63,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('San Antonio Solar','Solar',140,'SZ',28,'ERCOT',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','ERCOT'),
  ('Midland Peaker','Peaker',40,'WZ',4,'ERCOT',NULL,DATE '2027-06-01',DATE '2037-06-01',NULL),
  ('Beaumont Solar','Solar',90,'HZ',18,'ERCOT',DATE '2026-09-01',DATE '2027-09-01',DATE '2042-09-01','ERCOT'),
  ('Abilene Wind','Wind',250,'WZ',87.5,'ERCOT',DATE '2026-11-01',DATE '2028-11-01',DATE '2048-11-01','ERCOT'),
  ('Victoria Hybrid','Hybrid',30,'SZ',7.5,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('Waco Solar','Solar',110,'NZ',22,'ERCOT',DATE '2027-01-01',DATE '2028-01-01',DATE '2043-01-01','ERCOT'),
  ('Bay City SMR','Nuclear',300,'HZ',285,'ERCOT',DATE '2030-05-01',DATE '2032-05-01',DATE '2057-05-01',NULL),
  ('Lubbock Wind','Wind',160,'WZ',56,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('Tyler Peaker','Peaker',60,'NZ',6,'ERCOT',DATE '2026-07-01',DATE '2027-07-01',DATE '2042-07-01',NULL),
  ('Rio Grande Solar','Solar',180,'SZ',36,'ERCOT',DATE '2026-10-01',DATE '2027-10-01',DATE '2042-10-01','ERCOT'),
  ('El Paso Edge Wind','Wind',140,'WZ',49,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('Houston CCGT II','Combined Cycle',450,'HZ',270,'ERCOT',DATE '2027-02-01',DATE '2029-02-01',DATE '2049-02-01',NULL),
  ('Denton Solar','Solar',70,'NZ',14,'ERCOT',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','ERCOT'),
  ('Sweetwater Hybrid','Hybrid',80,'WZ',20,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  ('McAllen Wind','Wind',210,'SZ',73.5,'ERCOT',DATE '2026-09-01',DATE '2028-09-01',DATE '2048-09-01','ERCOT'),
  ('Austin Metro Solar','Solar',130,'SZ',26,'ERCOT',NULL,NULL,NULL,'ERCOT'),
  -- ── MISO ───────────────────────────────────────────────────────────────────
  ('MidAmerican Wind','Wind',200,'MEC',70,'MISO',NULL,NULL,NULL,'M-RETS'),
  ('Ameren IL Solar','Solar',100,'AMIL',20,'MISO',DATE '2026-10-01',DATE '2027-10-01',DATE '2042-10-01','M-RETS'),
  ('Detroit River CCGT','Combined Cycle',500,'DTE',300,'MISO',NULL,DATE '2027-06-01',DATE '2047-06-01',NULL),
  ('Entergy LA Solar','Solar',150,'EAI',30,'MISO',DATE '2026-09-01',DATE '2027-09-01',DATE '2047-09-01','M-RETS'),
  ('Thumb Area Wind','Wind',120,'DTE',42,'MISO',NULL,NULL,NULL,'MIRECS'),
  ('NIPSCO Hybrid','Hybrid',40,'NIPS',10,'MISO',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','M-RETS'),
  ('Twin Cities Peaker','Peaker',80,'NSP',8,'MISO',NULL,DATE '2027-06-01',DATE '2042-06-01',NULL),
  ('Bayou Peaker','Peaker',100,'EAI',10,'MISO',DATE '2026-11-01',DATE '2027-11-01',DATE '2037-11-01',NULL),
  ('Badger State Solar','Solar',75,'WEC',15,'MISO',NULL,NULL,NULL,'M-RETS'),
  ('Monticello SMR','Nuclear',300,'NSP',285,'MISO',DATE '2030-05-01',DATE '2032-05-01',DATE '2057-05-01',NULL),
  ('Hoosier Wind Farm','Wind',180,'NIPS',63,'MISO',DATE '2026-07-01',DATE '2028-07-01',DATE '2048-07-01','M-RETS'),
  ('Grand Rapids Solar','Solar',90,'CONS',18,'MISO',DATE '2026-09-01',DATE '2027-09-01',DATE '2042-09-01','MIRECS'),
  ('Iowa Plains Wind','Wind',250,'MEC',87.5,'MISO',NULL,NULL,NULL,'M-RETS'),
  ('St. Louis Peaker','Peaker',60,'AMMO',6,'MISO',DATE '2027-03-01',DATE '2028-03-01',DATE '2043-03-01',NULL),
  ('New Orleans Solar','Solar',110,'EAI',22,'MISO',NULL,NULL,NULL,'M-RETS'),
  ('Duluth Hybrid','Hybrid',50,'ALTE',12.5,'MISO',DATE '2026-12-01',DATE '2027-12-01',DATE '2042-12-01','M-RETS'),
  ('Lansing CCGT','Combined Cycle',400,'CONS',240,'MISO',DATE '2027-06-01',DATE '2029-06-01',DATE '2049-06-01',NULL),
  ('Minnesota Valley Wind','Wind',170,'NSP',59.5,'MISO',NULL,NULL,NULL,'M-RETS'),
  ('Peoria Solar','Solar',130,'AMIL',26,'MISO',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','M-RETS'),
  ('Gary Peaker','Peaker',45,'NIPS',4.5,'MISO',NULL,DATE '2027-06-01',DATE '2037-06-01',NULL),
  ('Baton Rouge Solar','Solar',160,'EAI',32,'MISO',DATE '2026-09-01',DATE '2027-09-01',DATE '2042-09-01','M-RETS'),
  ('Des Moines Wind','Wind',210,'MEC',73.5,'MISO',DATE '2026-11-01',DATE '2028-11-01',DATE '2048-11-01','M-RETS'),
  ('Milwaukee Hybrid','Hybrid',40,'WEC',10,'MISO',NULL,NULL,NULL,'M-RETS'),
  ('Springfield Solar','Solar',85,'AMIL',17,'MISO',DATE '2027-01-01',DATE '2028-01-01',DATE '2043-01-01','M-RETS'),
  ('Palisades SMR','Nuclear',300,'CONS',285,'MISO',DATE '2030-05-01',DATE '2032-05-01',DATE '2057-05-01',NULL),
  ('Fargo Wind','Wind',140,'OTP',49,'MISO',NULL,NULL,NULL,'M-RETS'),
  ('Little Rock Peaker','Peaker',70,'EAI',7,'MISO',DATE '2026-07-01',DATE '2027-07-01',DATE '2042-07-01',NULL),
  ('Green Bay Solar','Solar',60,'WPS',12,'MISO',DATE '2026-10-01',DATE '2027-10-01',DATE '2042-10-01','M-RETS'),
  ('Ann Arbor Wind','Wind',100,'DTE',35,'MISO',NULL,NULL,NULL,'MIRECS'),
  ('Quad Cities CCGT','Combined Cycle',550,'AMIL',330,'MISO',DATE '2027-02-01',DATE '2029-02-01',DATE '2049-02-01',NULL),
  ('Cedar Rapids Solar','Solar',120,'MEC',24,'MISO',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','M-RETS'),
  ('Bismarck Hybrid','Hybrid',30,'MDU',7.5,'MISO',NULL,NULL,NULL,'M-RETS'),
  ('Rochester Wind','Wind',190,'NSP',66.5,'MISO',DATE '2026-09-01',DATE '2028-09-01',DATE '2048-09-01','M-RETS'),
  -- ── SPP (SWPP) ───────────────────────────────────────────────────────────────
  ('Cimarron Wind','Wind',250,'OKGE',87.5,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Flint Hills Solar','Solar',100,'WR',20,'SWPP',DATE '2026-09-01',DATE '2027-09-01',DATE '2042-09-01','M-RETS'),
  ('Panhandle Peaker','Peaker',50,'SPS',5,'SWPP',NULL,DATE '2027-06-01',DATE '2042-06-01',NULL),
  ('Red River CCGT','Combined Cycle',400,'CSWS',240,'SWPP',DATE '2026-10-01',DATE '2028-10-01',DATE '2048-10-01',NULL),
  ('Nebraska Plains Wind','Wind',200,'NPPD',70,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Tulsa Metro Solar','Solar',80,'OKGE',16,'SWPP',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','M-RETS'),
  ('Smoky Hills Hybrid','Hybrid',60,'WR',15,'SWPP',DATE '2026-11-01',DATE '2027-11-01',DATE '2042-11-01','M-RETS'),
  ('Lubbock Solar Farm','Solar',120,'SPS',24,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Wolf Creek SMR','Nuclear',300,'WR',285,'SWPP',DATE '2030-05-01',DATE '2032-05-01',DATE '2057-05-01',NULL),
  ('Ouachita Peaker','Peaker',75,'CSWS',7.5,'SWPP',NULL,DATE '2027-06-01',DATE '2037-06-01',NULL),
  ('Platte River Wind','Wind',150,'NPPD',52.5,'SWPP',DATE '2026-07-01',DATE '2028-07-01',DATE '2048-07-01','M-RETS'),
  ('Wichita Solar','Solar',140,'WR',28,'SWPP',DATE '2026-10-01',DATE '2027-10-01',DATE '2042-10-01','M-RETS'),
  ('Enid Wind Farm','Wind',180,'OKGE',63,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Amarillo Peaker II','Peaker',60,'SPS',6,'SWPP',DATE '2027-03-01',DATE '2028-03-01',DATE '2043-03-01',NULL),
  ('Lincoln Solar','Solar',90,'LES',18,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Shreveport Hybrid','Hybrid',40,'CSWS',10,'SWPP',DATE '2026-12-01',DATE '2027-12-01',DATE '2042-12-01','M-RETS'),
  ('Omaha CCGT','Combined Cycle',450,'OPPD',270,'SWPP',DATE '2027-06-01',DATE '2029-06-01',DATE '2049-06-01',NULL),
  ('Dodge City Wind','Wind',220,'SECI',77,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Norman Solar','Solar',110,'OKGE',22,'SWPP',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','M-RETS'),
  ('Topeka Peaker','Peaker',35,'WR',3.5,'SWPP',NULL,DATE '2027-06-01',DATE '2037-06-01',NULL),
  ('Roswell Solar','Solar',150,'SPS',30,'SWPP',DATE '2026-09-01',DATE '2027-09-01',DATE '2042-09-01','M-RETS'),
  ('Grand Island Wind','Wind',190,'NPPD',66.5,'SWPP',DATE '2026-11-01',DATE '2028-11-01',DATE '2048-11-01','M-RETS'),
  ('Fayetteville Hybrid','Hybrid',50,'CSWS',12.5,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Salina Solar','Solar',70,'WR',14,'SWPP',DATE '2027-01-01',DATE '2028-01-01',DATE '2043-01-01','M-RETS'),
  ('Cooper SMR','Nuclear',300,'NPPD',285,'SWPP',DATE '2030-05-01',DATE '2032-05-01',DATE '2057-05-01',NULL),
  ('Woodward Wind','Wind',260,'OKGE',91,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Texarkana Peaker','Peaker',80,'CSWS',8,'SWPP',DATE '2026-07-01',DATE '2027-07-01',DATE '2042-07-01',NULL),
  ('Clovis Solar','Solar',130,'SPS',26,'SWPP',DATE '2026-10-01',DATE '2027-10-01',DATE '2042-10-01','M-RETS'),
  ('Kearney Wind','Wind',170,'NPPD',59.5,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Lawton CCGT','Combined Cycle',350,'CSWS',210,'SWPP',DATE '2027-02-01',DATE '2029-02-01',DATE '2049-02-01',NULL),
  ('Manhattan Solar','Solar',85,'WR',17,'SWPP',DATE '2026-08-01',DATE '2027-08-01',DATE '2042-08-01','M-RETS'),
  ('Mooreland Hybrid','Hybrid',45,'WFEC',11.25,'SWPP',NULL,NULL,NULL,'M-RETS'),
  ('Guymon Wind','Wind',240,'SPS',84,'SWPP',DATE '2026-09-01',DATE '2028-09-01',DATE '2048-09-01','M-RETS');

-- New projects (skip any name that already exists). location set to the zone.
INSERT INTO public.projects
  (name, generation_type, capacity_mw, location, zone, iso,
   expected_cod, term_start_date, term_end_date, delivery_term_years, status, visibility)
SELECT s.name, s.gtype, s.cap, s.zone, s.zone, s.iso,
       s.cod, s.tstart, s.tend,
       CASE WHEN s.tstart IS NOT NULL AND s.tend IS NOT NULL
            THEN EXTRACT(YEAR FROM age(s.tend, s.tstart))::int END,
       'published', 'marketplace'
FROM _iso_seed s
WHERE NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.name = s.name);

-- Unbundled product detail.
INSERT INTO planning.project_products (iso_id, product_type, capacity_mw, eda)
SELECT p.id, 'capacity', s.cap, s.zone
FROM _iso_seed s JOIN public.projects p ON p.name = s.name
ON CONFLICT (iso_id, product_type) DO NOTHING;

INSERT INTO planning.project_products (iso_id, product_type, energy_mwh_max, zone)
SELECT p.id, 'energy', s.hourly, s.zone
FROM _iso_seed s JOIN public.projects p ON p.name = s.name
ON CONFLICT (iso_id, product_type) DO NOTHING;

INSERT INTO planning.project_products (iso_id, product_type, rec_pct, retiring_agency, matching_format)
SELECT p.id, 'rec', 100, s.rec_agency, 'yearly'
FROM _iso_seed s JOIN public.projects p ON p.name = s.name
WHERE s.rec_agency IS NOT NULL
ON CONFLICT (iso_id, product_type) DO NOTHING;

COMMIT;
