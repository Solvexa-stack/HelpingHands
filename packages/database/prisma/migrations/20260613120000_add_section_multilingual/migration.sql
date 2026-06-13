-- Add multilingual columns to study_department_templates
ALTER TABLE "study_department_templates"
  ADD COLUMN "name_ar" VARCHAR(255),
  ADD COLUMN "name_fr" VARCHAR(255),
  ADD COLUMN "description_ar" TEXT,
  ADD COLUMN "description_fr" TEXT;

-- Add multilingual columns to study_sections
ALTER TABLE "study_sections"
  ADD COLUMN "name_ar" VARCHAR(255),
  ADD COLUMN "name_fr" VARCHAR(255),
  ADD COLUMN "description_ar" TEXT,
  ADD COLUMN "description_fr" TEXT;

-- ─── Populate template translations ──────────────────────────────────────────

-- Agricultural
UPDATE "study_department_templates" SET name_ar='دراسة التربة', name_fr='Étude du sol', description_ar='تحليل جودة التربة وتركيبها وملاءمتها للزراعة', description_fr='Analyse de la qualité, de la composition du sol et de son aptitude à l''agriculture' WHERE id=1;
UPDATE "study_department_templates" SET name_ar='توفر المياه', name_fr='Accès à l''eau', description_ar='توافر مصادر الري والمياه', description_fr='Disponibilité de l''irrigation et des sources d''eau' WHERE id=2;
UPDATE "study_department_templates" SET name_ar='تخطيط المحاصيل', name_fr='Planification des cultures', description_ar='المحاصيل الموصى بها بناءً على المناخ وطلب السوق', description_fr='Cultures recommandées selon le climat et la demande du marché' WHERE id=3;
UPDATE "study_department_templates" SET name_ar='المناخ والموسم', name_fr='Climat et saisons', description_ar='الأنماط الموسمية وعوامل مخاطر المناخ', description_fr='Modèles saisonniers et facteurs de risque climatique' WHERE id=4;
UPDATE "study_department_templates" SET name_ar='التقدير المالي', name_fr='Estimation financière', description_ar='تكاليف المدخلات والإنتاج المتوقع وتوقعات الربح', description_fr='Coûts des intrants, rendement attendu et projections de bénéfices' WHERE id=5;
UPDATE "study_department_templates" SET name_ar='القانوني والأراضي', name_fr='Juridique et foncier', description_ar='ملكية الأرض وحقوق الاستخدام واللوائح الزراعية', description_fr='Propriété foncière, droits d''usage et réglementations agricoles' WHERE id=6;
UPDATE "study_department_templates" SET name_ar='التأثير المجتمعي', name_fr='Impact communautaire', description_ar='التأثير على المزارعين المحليين والأمن الغذائي', description_fr='Effet sur les agriculteurs locaux et la sécurité alimentaire' WHERE id=7;
UPDATE "study_department_templates" SET name_ar='نظرة مالية عامة', name_fr='Vue d''ensemble financière', description_ar='تفصيل الميزانية الإجمالية ومصادر التمويل', description_fr='Répartition globale du budget et sources de financement' WHERE id=8;
UPDATE "study_department_templates" SET name_ar='الامتثال القانوني', name_fr='Conformité légale', description_ar='المتطلبات التنظيمية والتصاريح اللازمة', description_fr='Exigences réglementaires et permis nécessaires' WHERE id=9;
UPDATE "study_department_templates" SET name_ar='تقييم الأثر الاجتماعي', name_fr='Évaluation de l''impact social', description_ar='الفوائد الاجتماعية المتوقعة والمجتمعات المتأثرة', description_fr='Bénéfices sociaux attendus et communautés affectées' WHERE id=10;
UPDATE "study_department_templates" SET name_ar='الجدول الزمني للمشروع', name_fr='Calendrier du projet', description_ar='المعالم والمراحل وجدول التسليم', description_fr='Jalons, phases et calendrier de livraison' WHERE id=11;

-- Industrial
UPDATE "study_department_templates" SET name_ar='التصميم التقني', name_fr='Conception technique', description_ar='المواصفات الهندسية وتخطيط المنشأة', description_fr='Spécifications d''ingénierie et aménagement des installations' WHERE id=12;
UPDATE "study_department_templates" SET name_ar='الدراسة البيئية', name_fr='Étude environnementale', description_ar='تأثير التلوث وخطة التخفيف البيئي', description_fr='Impact de la pollution et plan d''atténuation environnementale' WHERE id=13;
UPDATE "study_department_templates" SET name_ar='السلامة والمخاطر', name_fr='Sécurité et risques', description_ar='المخاطر المهنية وبروتوكولات إدارة المخاطر', description_fr='Risques professionnels et protocoles de gestion des risques' WHERE id=14;
UPDATE "study_department_templates" SET name_ar='سلسلة التوريد', name_fr='Chaîne d''approvisionnement', description_ar='مصادر المواد الخام وخطة الخدمات اللوجستية', description_fr='Approvisionnement en matières premières et plan logistique' WHERE id=15;
UPDATE "study_department_templates" SET name_ar='الميزانية والعائد على الاستثمار', name_fr='Budget et retour sur investissement', description_ar='النفقات الرأسمالية وتحليل العائد على الاستثمار', description_fr='Dépenses en capital et analyse du retour sur investissement' WHERE id=16;
UPDATE "study_department_templates" SET name_ar='التصاريح القانونية', name_fr='Permis légaux', description_ar='التراخيص الخاصة بالصناعة وموافقات تقسيم المناطق', description_fr='Licences spécifiques à l''industrie et approbations de zonage' WHERE id=17;
UPDATE "study_department_templates" SET name_ar='تقرير خلق فرص العمل', name_fr='Rapport sur la création d''emplois', description_ar='عدد الوظائف المنشأة واحتياجات التدريب المهني', description_fr='Nombre d''emplois créés et besoins en formation de la main-d''œuvre' WHERE id=18;
UPDATE "study_department_templates" SET name_ar='نظرة مالية عامة', name_fr='Vue d''ensemble financière', description_ar='تفصيل الميزانية الإجمالية ومصادر التمويل', description_fr='Répartition globale du budget et sources de financement' WHERE id=19;
UPDATE "study_department_templates" SET name_ar='الامتثال القانوني', name_fr='Conformité légale', description_ar='المتطلبات التنظيمية والتصاريح اللازمة', description_fr='Exigences réglementaires et permis nécessaires' WHERE id=20;
UPDATE "study_department_templates" SET name_ar='تقييم الأثر الاجتماعي', name_fr='Évaluation de l''impact social', description_ar='الفوائد الاجتماعية المتوقعة والمجتمعات المتأثرة', description_fr='Bénéfices sociaux attendus et communautés affectées' WHERE id=21;
UPDATE "study_department_templates" SET name_ar='الجدول الزمني للمشروع', name_fr='Calendrier du projet', description_ar='المعالم والمراحل وجدول التسليم', description_fr='Jalons, phases et calendrier de livraison' WHERE id=22;

-- Infrastructure
UPDATE "study_department_templates" SET name_ar='الدراسة الهندسية', name_fr='Étude d''ingénierie', description_ar='تقييم الهندسة الإنشائية والمدنية', description_fr='Évaluation de l''ingénierie structurelle et civile' WHERE id=23;
UPDATE "study_department_templates" SET name_ar='المسح الأرضي', name_fr='Levé de terrain', description_ar='نتائج المسح الطوبوغرافي والجيوتقني', description_fr='Résultats du levé topographique et géotechnique' WHERE id=24;
UPDATE "study_department_templates" SET name_ar='الصمود أمام الكوارث', name_fr='Résilience aux catastrophes', description_ar='مقاومة الزلازل والفيضانات والظروف الجوية القاسية', description_fr='Résistance aux séismes, inondations et conditions météorologiques extrêmes' WHERE id=25;
UPDATE "study_department_templates" SET name_ar='خطة الصيانة', name_fr='Plan de maintenance', description_ar='جدول الصيانة طويل الأمد والتكاليف المرتبطة', description_fr='Programme d''entretien à long terme et coûts associés' WHERE id=26;
UPDATE "study_department_templates" SET name_ar='التكلفة والتمويل', name_fr='Coût et financement', description_ar='ميزانية البناء وتفصيل مصادر التمويل', description_fr='Budget de construction et répartition du financement' WHERE id=27;
UPDATE "study_department_templates" SET name_ar='السكان المتأثرون', name_fr='Population affectée', description_ar='عدد المستفيدين وخصائصهم الديموغرافية', description_fr='Nombre et données démographiques des bénéficiaires' WHERE id=28;
UPDATE "study_department_templates" SET name_ar='أولوية إعادة الإعمار', name_fr='Priorité de reconstruction', description_ar='تقدير الإلحاحية ومبررات الأولوية', description_fr='Score d''urgence et justification de la priorisation' WHERE id=29;
UPDATE "study_department_templates" SET name_ar='نظرة مالية عامة', name_fr='Vue d''ensemble financière', description_ar='تفصيل الميزانية الإجمالية ومصادر التمويل', description_fr='Répartition globale du budget et sources de financement' WHERE id=30;
UPDATE "study_department_templates" SET name_ar='الامتثال القانوني', name_fr='Conformité légale', description_ar='المتطلبات التنظيمية والتصاريح اللازمة', description_fr='Exigences réglementaires et permis nécessaires' WHERE id=31;
UPDATE "study_department_templates" SET name_ar='تقييم الأثر الاجتماعي', name_fr='Évaluation de l''impact social', description_ar='الفوائد الاجتماعية المتوقعة والمجتمعات المتأثرة', description_fr='Bénéfices sociaux attendus et communautés affectées' WHERE id=32;
UPDATE "study_department_templates" SET name_ar='الجدول الزمني للمشروع', name_fr='Calendrier du projet', description_ar='المعالم والمراحل وجدول التسليم', description_fr='Jalons, phases et calendrier de livraison' WHERE id=33;

-- Energy
UPDATE "study_department_templates" SET name_ar='دراسة الطلب على الطاقة', name_fr='Étude de la demande en énergie', description_ar='الطلب الحالي والمتوقع على الطاقة في المنطقة', description_fr='Demande énergétique actuelle et projetée dans la zone' WHERE id=34;
UPDATE "study_department_templates" SET name_ar='اختيار التكنولوجيا', name_fr='Choix technologique', description_ar='تقييم الطاقة الشمسية والرياح والمائية أو غيرها', description_fr='Évaluation du solaire, éolien, hydraulique ou autres sources' WHERE id=35;
UPDATE "study_department_templates" SET name_ar='الربط بالشبكة', name_fr='Connexion au réseau électrique', description_ar='خطة التكامل مع البنية التحتية للطاقة القائمة', description_fr='Plan d''intégration avec l''infrastructure électrique existante' WHERE id=36;
UPDATE "study_department_templates" SET name_ar='التخزين والتوزيع', name_fr='Stockage et distribution', description_ar='تخزين البطاريات وبنية توزيع الطاقة', description_fr='Stockage par batteries et architecture de distribution d''énergie' WHERE id=37;
UPDATE "study_department_templates" SET name_ar='التقييم البيئي', name_fr='Évaluation environnementale', description_ar='التأثير البيئي لمنشأة الطاقة', description_fr='Impact écologique de l''installation énergétique' WHERE id=38;
UPDATE "study_department_templates" SET name_ar='التكلفة لكل كيلوواط ساعة', name_fr='Coût par kWh', description_ar='التكلفة الموحدة للطاقة ونموذج التسعير', description_fr='Coût actualisé de l''énergie et modèle de tarification' WHERE id=39;
UPDATE "study_department_templates" SET name_ar='تدريب المشغلين', name_fr='Formation des opérateurs', description_ar='خطة تدريب الموظفين المحليين لتشغيل النظام وصيانته', description_fr='Plan de formation du personnel local pour exploiter et entretenir le système' WHERE id=40;
UPDATE "study_department_templates" SET name_ar='نظرة مالية عامة', name_fr='Vue d''ensemble financière', description_ar='تفصيل الميزانية الإجمالية ومصادر التمويل', description_fr='Répartition globale du budget et sources de financement' WHERE id=41;
UPDATE "study_department_templates" SET name_ar='الامتثال القانوني', name_fr='Conformité légale', description_ar='المتطلبات التنظيمية والتصاريح اللازمة', description_fr='Exigences réglementaires et permis nécessaires' WHERE id=42;
UPDATE "study_department_templates" SET name_ar='تقييم الأثر الاجتماعي', name_fr='Évaluation de l''impact social', description_ar='الفوائد الاجتماعية المتوقعة والمجتمعات المتأثرة', description_fr='Bénéfices sociaux attendus et communautés affectées' WHERE id=43;
UPDATE "study_department_templates" SET name_ar='الجدول الزمني للمشروع', name_fr='Calendrier du projet', description_ar='المعالم والمراحل وجدول التسليم', description_fr='Jalons, phases et calendrier de livraison' WHERE id=44;

-- Housing
UPDATE "study_department_templates" SET name_ar='التصميم الإنشائي', name_fr='Conception structurelle', description_ar='المخططات المعمارية وتفاصيل الهندسة الإنشائية', description_fr='Plans architecturaux et détails d''ingénierie structurelle' WHERE id=45;
UPDATE "study_department_templates" SET name_ar='ملكية الأرض', name_fr='Propriété foncière', description_ar='التحقق من سند الأرض وحقوق الاستخدام', description_fr='Vérification du titre foncier et des droits d''usage' WHERE id=46;
UPDATE "study_department_templates" SET name_ar='قائمة المستفيدين', name_fr='Liste des bénéficiaires', description_ar='الأسر المحددة ومعايير الأهلية', description_fr='Familles identifiées et critères d''éligibilité' WHERE id=47;
UPDATE "study_department_templates" SET name_ar='توفير مواد البناء', name_fr='Approvisionnement en matériaux', description_ar='مصادر مواد البناء وخطة سلسلة التوريد', description_fr='Approvisionnement en matériaux de construction et plan logistique' WHERE id=48;
UPDATE "study_department_templates" SET name_ar='خطة الصرف الصحي', name_fr='Plan d''assainissement', description_ar='أنظمة المياه والصرف الصحي وإدارة النفايات', description_fr='Systèmes d''eau, d''assainissement et de gestion des déchets' WHERE id=49;
UPDATE "study_department_templates" SET name_ar='الميزانية لكل وحدة سكنية', name_fr='Budget par logement', description_ar='تفصيل التكلفة لكل وحدة سكنية', description_fr='Répartition des coûts par unité de logement' WHERE id=50;
UPDATE "study_department_templates" SET name_ar='تأثير التهجير', name_fr='Impact du déplacement', description_ar='تقييم الأسر التي تم تهجيرها أو إعادة توطينها', description_fr='Évaluation des familles déplacées ou relogées' WHERE id=51;
UPDATE "study_department_templates" SET name_ar='نظرة مالية عامة', name_fr='Vue d''ensemble financière', description_ar='تفصيل الميزانية الإجمالية ومصادر التمويل', description_fr='Répartition globale du budget et sources de financement' WHERE id=52;
UPDATE "study_department_templates" SET name_ar='الامتثال القانوني', name_fr='Conformité légale', description_ar='المتطلبات التنظيمية والتصاريح اللازمة', description_fr='Exigences réglementaires et permis nécessaires' WHERE id=53;
UPDATE "study_department_templates" SET name_ar='تقييم الأثر الاجتماعي', name_fr='Évaluation de l''impact social', description_ar='الفوائد الاجتماعية المتوقعة والمجتمعات المتأثرة', description_fr='Bénéfices sociaux attendus et communautés affectées' WHERE id=54;
UPDATE "study_department_templates" SET name_ar='الجدول الزمني للمشروع', name_fr='Calendrier du projet', description_ar='المعالم والمراحل وجدول التسليم', description_fr='Jalons, phases et calendrier de livraison' WHERE id=55;

-- ─── Back-fill existing study sections from template translations ─────────────
UPDATE "study_sections" ss
SET
  name_ar = t.name_ar,
  name_fr = t.name_fr,
  description_ar = t.description_ar,
  description_fr = t.description_fr
FROM "study_department_templates" t
WHERE ss.name = t.name
  AND ss.name_ar IS NULL;
