INSERT INTO "Event" ("id","title","description","countryCode","city","place","startAt","endAt","lat","lng","source","sourceId","sourceUrl","rawPayload","status","createdAt","updatedAt")
VALUES
-- Krakow
('krk-001','Koncert: ACJATON + VIPER TOUCH',NULL,'PL','Krakow','Pub pod Ziemia','2026-01-13T14:00:00Z','2026-01-13T16:00:00Z',50.051600,19.944900,'manual',NULL,'https://facebook.com/',NULL,'approved',NOW(),NOW()),
('krk-002','Rock Night',NULL,'PL','Krakow','Klub Studio','2026-01-13T19:00:00Z','2026-01-13T21:30:00Z',50.067600,19.912900,'manual',NULL,'https://example.com/krk2',NULL,'approved',NOW(),NOW()),
('krk-003','Electronic Live Set',NULL,'PL','Krakow','Hala 100-lecia','2026-01-14T20:00:00Z','2026-01-14T23:00:00Z',50.046700,19.956300,'manual',NULL,'https://example.com/krk3',NULL,'approved',NOW(),NOW()),

-- Warszawa
('waw-001','Jazz Night',NULL,'PL','Warszawa','Klub X','2026-01-15T17:00:00Z','2026-01-15T18:00:00Z',52.229700,21.012200,'manual',NULL,'https://example.com/waw1',NULL,'approved',NOW(),NOW()),
('waw-002','Stand-up: Open Mic',NULL,'PL','Warszawa','Proxima','2026-01-16T18:30:00Z','2026-01-16T20:00:00Z',52.238300,21.013700,'manual',NULL,'https://example.com/waw2',NULL,'approved',NOW(),NOW()),
('waw-003','Techno Party',NULL,'PL','Warszawa','Smolna','2026-01-17T21:00:00Z','2026-01-18T03:00:00Z',52.234900,21.033500,'manual',NULL,'https://example.com/waw3',NULL,'approved',NOW(),NOW()),

-- Gdansk
('gdn-001','Indie Concert',NULL,'PL','Gdansk','B90','2026-01-18T18:00:00Z','2026-01-18T20:30:00Z',54.351900,18.657000,'manual',NULL,'https://example.com/gdn1',NULL,'approved',NOW(),NOW()),
('gdn-002','Symphonic Evening',NULL,'PL','Gdansk','Filharmonia Baltycka','2026-01-19T19:00:00Z','2026-01-19T21:00:00Z',54.351000,18.659400,'manual',NULL,'https://example.com/gdn2',NULL,'approved',NOW(),NOW()),

-- Wroclaw
('wro-001','Live Blues',NULL,'PL','Wroclaw','Vertigo Jazz Club','2026-01-20T19:30:00Z','2026-01-20T22:00:00Z',51.107900,17.038500,'manual',NULL,'https://example.com/wro1',NULL,'approved',NOW(),NOW()),

-- Poznan
('poz-001','Metal Fest',NULL,'PL','Poznan','Tama','2026-01-21T20:00:00Z','2026-01-21T23:59:00Z',52.406400,16.925200,'manual',NULL,'https://example.com/poz1',NULL,'approved',NOW(),NOW());
