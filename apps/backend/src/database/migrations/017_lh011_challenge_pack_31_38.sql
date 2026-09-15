-- Challenges 31–38: seed eight engines and pin mixed catalog (risk still paused).
DO $$
DECLARE
  v_catalog_release_id uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa17';
  v_loc_release_id uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddd17';
  v_wait_vid uuid;
  v_trap_vid uuid;
  v_swipe_vid uuid;
  v_tap_vid uuid;
  v_mem_vid uuid;
  v_hold_vid uuid;
  v_shake_vid uuid;
  v_tilt_vid uuid;
  v_audio_vid uuid;
  v_pair_vid uuid;
  v_trivia_vid uuid;
  v_geo_vid uuid;
  v_odd_vid uuid;
  v_order_vid uuid;
  v_maze_vid uuid;
  v_bal_vid uuid;
  v_stroop_vid uuid;
  v_search_vid uuid;
  v_trivia_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc16';
  v_geo_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc17';
  v_odd_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc18';
  v_order_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc19';
  v_maze_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc20';
  v_bal_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc21';
  v_stroop_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc22';
  v_search_tid uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccc23';
BEGIN

  INSERT INTO content_families (id, title) VALUES
    ('trivia', 'Trivia'),
    ('geography', 'Geography'),
    ('focus', 'Focus'),
    ('order', 'Order'),
    ('precision', 'Precision'),
    ('logic', 'Logic'),
    ('search', 'Search')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_categories (id, family_id, title) VALUES
    ('trivia.multiple_choice', 'trivia', 'Multiple choice'),
    ('geography.select_on_map', 'geography', 'Select on map'),
    ('focus.odd_one_out', 'focus', 'Odd one out'),
    ('focus.stroop', 'focus', 'Stroop'),
    ('order.sequence_sort', 'order', 'Sequence sort'),
    ('precision.maze_path', 'precision', 'Maze path'),
    ('logic.balance_scale', 'logic', 'Balance scale'),
    ('search.select_occurrences', 'search', 'Select occurrences')
  ON CONFLICT (id) DO NOTHING;


  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_trivia_tid, 'trivia.multiple_choice', 'trivia', 'trivia.multiple_choice', 'Trivia multiple choice', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_trivia_tid FROM content_templates WHERE slug = 'trivia.multiple_choice';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd16', v_trivia_tid, 1, 'published',
    '{"definitionId": "trivia.multiple_choice.dev", "definitionVersion": 1, "engineId": "trivia.multiple_choice", "durationMs": 8000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.trivia.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.trivia", "promptKey": "challenge.trivia.prompt", "questionKey": "trivia.q.japan_capital", "optionKeys": ["trivia.opt.osaka", "trivia.opt.tokyo", "trivia.opt.seoul", "trivia.opt.kyoto"], "footerKey": "challenge.trivia.footer"}, "serverConfig": {"questions": [{"questionKey": "trivia.q.japan_capital", "optionKeys": ["trivia.opt.osaka", "trivia.opt.tokyo", "trivia.opt.seoul", "trivia.opt.kyoto"], "correctOptionKey": "trivia.opt.tokyo"}, {"questionKey": "trivia.q.egypt_capital", "optionKeys": ["trivia.opt.cairo", "trivia.opt.alex", "trivia.opt.giza", "trivia.opt.aswan"], "correctOptionKey": "trivia.opt.cairo"}]}, "internalTitle": "Trivia multiple choice", "familyId": "trivia", "categoryId": "trivia.multiple_choice", "difficulty": "easy", "instructionAr": "اختر الإجابة الصحيحة.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.trivia.a11y_fallback", "requiredAssetIds": []}'::jsonb,
    md5('trivia.multiple_choice.v1'),
    'pack 31-38 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;


  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_geo_tid, 'geography.select_on_map', 'geography', 'geography.select_on_map', 'Select on map', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_geo_tid FROM content_templates WHERE slug = 'geography.select_on_map';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd17', v_geo_tid, 1, 'published',
    '{"definitionId": "geography.select_on_map.dev", "definitionVersion": 1, "engineId": "geography.select_on_map", "durationMs": 8000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.map.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.geography", "promptKey": "challenge.map.prompt", "footerKey": "challenge.map.footer", "mapId": "map.africa", "assetId": "map.africa", "imageWidth": 1254, "imageHeight": 1254, "targetLabelKey": "geo.country.mauritania", "regions": [{"regionId": "mauritania", "labelKey": "geo.country.mauritania", "polygon": [{"x": 302, "y": 824}, {"x": 51, "y": 824}, {"x": 41, "y": 663}, {"x": 110, "y": 563}, {"x": 199, "y": 563}, {"x": 200, "y": 545}, {"x": 289, "y": 616}, {"x": 269, "y": 625}]}, {"regionId": "algeria", "labelKey": "geo.country.algeria", "polygon": [{"x": 425, "y": 719}, {"x": 396, "y": 714}, {"x": 378, "y": 677}, {"x": 204, "y": 547}, {"x": 200, "y": 510}, {"x": 260, "y": 487}, {"x": 327, "y": 452}, {"x": 380, "y": 409}, {"x": 371, "y": 341}, {"x": 469, "y": 303}, {"x": 600, "y": 292}, {"x": 589, "y": 310}, {"x": 591, "y": 347}, {"x": 589, "y": 360}, {"x": 573, "y": 372}, {"x": 576, "y": 396}, {"x": 611, "y": 425}, {"x": 618, "y": 458}, {"x": 614, "y": 485}, {"x": 623, "y": 539}, {"x": 627, "y": 565}, {"x": 614, "y": 576}, {"x": 629, "y": 603}, {"x": 647, "y": 599}, {"x": 658, "y": 628}, {"x": 482, "y": 734}, {"x": 431, "y": 744}]}, {"regionId": "morocco", "labelKey": "geo.country.morocco", "polygon": [{"x": 378, "y": 409}, {"x": 331, "y": 452}, {"x": 260, "y": 487}, {"x": 202, "y": 512}, {"x": 209, "y": 565}, {"x": 110, "y": 563}, {"x": 119, "y": 543}, {"x": 180, "y": 479}, {"x": 179, "y": 452}, {"x": 197, "y": 412}, {"x": 255, "y": 383}, {"x": 286, "y": 330}, {"x": 302, "y": 325}, {"x": 320, "y": 347}, {"x": 367, "y": 340}]}, {"regionId": "tunisia", "labelKey": "geo.country.tunisia", "polygon": [{"x": 618, "y": 467}, {"x": 614, "y": 423}, {"x": 578, "y": 398}, {"x": 569, "y": 376}, {"x": 593, "y": 363}, {"x": 587, "y": 305}, {"x": 634, "y": 276}, {"x": 662, "y": 300}, {"x": 652, "y": 316}, {"x": 662, "y": 340}, {"x": 638, "y": 370}, {"x": 660, "y": 383}, {"x": 665, "y": 423}, {"x": 636, "y": 439}, {"x": 642, "y": 465}, {"x": 620, "y": 483}]}, {"regionId": "libya", "labelKey": "geo.country.libya", "polygon": [{"x": 649, "y": 601}, {"x": 631, "y": 610}, {"x": 620, "y": 579}, {"x": 629, "y": 561}, {"x": 623, "y": 485}, {"x": 642, "y": 470}, {"x": 638, "y": 436}, {"x": 665, "y": 427}, {"x": 667, "y": 398}, {"x": 696, "y": 410}, {"x": 712, "y": 403}, {"x": 772, "y": 427}, {"x": 776, "y": 450}, {"x": 850, "y": 483}, {"x": 874, "y": 470}, {"x": 870, "y": 438}, {"x": 894, "y": 421}, {"x": 956, "y": 438}, {"x": 952, "y": 655}, {"x": 936, "y": 657}, {"x": 928, "y": 688}, {"x": 867, "y": 690}, {"x": 863, "y": 737}, {"x": 662, "y": 630}]}, {"regionId": "egypt", "labelKey": "geo.country.egypt", "polygon": [{"x": 956, "y": 438}, {"x": 1052, "y": 458}, {"x": 1070, "y": 438}, {"x": 1105, "y": 432}, {"x": 1126, "y": 448}, {"x": 1148, "y": 438}, {"x": 1163, "y": 474}, {"x": 1150, "y": 521}, {"x": 1115, "y": 479}, {"x": 1168, "y": 597}, {"x": 1163, "y": 616}, {"x": 1137, "y": 626}, {"x": 1115, "y": 663}, {"x": 1101, "y": 659}, {"x": 952, "y": 652}]}, {"regionId": "sudan", "labelKey": "geo.country.sudan", "polygon": [{"x": 1159, "y": 612}, {"x": 1184, "y": 674}, {"x": 1184, "y": 694}, {"x": 1212, "y": 719}, {"x": 1221, "y": 768}, {"x": 1188, "y": 797}, {"x": 1179, "y": 844}, {"x": 1164, "y": 875}, {"x": 1137, "y": 901}, {"x": 1105, "y": 901}, {"x": 1079, "y": 946}, {"x": 1079, "y": 980}, {"x": 1056, "y": 964}, {"x": 1043, "y": 973}, {"x": 1021, "y": 960}, {"x": 983, "y": 933}, {"x": 941, "y": 933}, {"x": 919, "y": 955}, {"x": 878, "y": 941}, {"x": 856, "y": 931}, {"x": 830, "y": 895}, {"x": 810, "y": 890}, {"x": 841, "y": 830}, {"x": 861, "y": 826}, {"x": 859, "y": 739}, {"x": 868, "y": 685}, {"x": 925, "y": 690}, {"x": 936, "y": 655}, {"x": 1101, "y": 659}, {"x": 1119, "y": 666}, {"x": 1141, "y": 623}]}]}, "serverConfig": {"maps": [{"mapId": "map.africa", "assetId": "map.africa", "imageWidth": 1254, "imageHeight": 1254, "regions": [{"regionId": "mauritania", "labelKey": "geo.country.mauritania", "polygon": [{"x": 302, "y": 824}, {"x": 51, "y": 824}, {"x": 41, "y": 663}, {"x": 110, "y": 563}, {"x": 199, "y": 563}, {"x": 200, "y": 545}, {"x": 289, "y": 616}, {"x": 269, "y": 625}]}, {"regionId": "algeria", "labelKey": "geo.country.algeria", "polygon": [{"x": 425, "y": 719}, {"x": 396, "y": 714}, {"x": 378, "y": 677}, {"x": 204, "y": 547}, {"x": 200, "y": 510}, {"x": 260, "y": 487}, {"x": 327, "y": 452}, {"x": 380, "y": 409}, {"x": 371, "y": 341}, {"x": 469, "y": 303}, {"x": 600, "y": 292}, {"x": 589, "y": 310}, {"x": 591, "y": 347}, {"x": 589, "y": 360}, {"x": 573, "y": 372}, {"x": 576, "y": 396}, {"x": 611, "y": 425}, {"x": 618, "y": 458}, {"x": 614, "y": 485}, {"x": 623, "y": 539}, {"x": 627, "y": 565}, {"x": 614, "y": 576}, {"x": 629, "y": 603}, {"x": 647, "y": 599}, {"x": 658, "y": 628}, {"x": 482, "y": 734}, {"x": 431, "y": 744}]}, {"regionId": "morocco", "labelKey": "geo.country.morocco", "polygon": [{"x": 378, "y": 409}, {"x": 331, "y": 452}, {"x": 260, "y": 487}, {"x": 202, "y": 512}, {"x": 209, "y": 565}, {"x": 110, "y": 563}, {"x": 119, "y": 543}, {"x": 180, "y": 479}, {"x": 179, "y": 452}, {"x": 197, "y": 412}, {"x": 255, "y": 383}, {"x": 286, "y": 330}, {"x": 302, "y": 325}, {"x": 320, "y": 347}, {"x": 367, "y": 340}]}, {"regionId": "tunisia", "labelKey": "geo.country.tunisia", "polygon": [{"x": 618, "y": 467}, {"x": 614, "y": 423}, {"x": 578, "y": 398}, {"x": 569, "y": 376}, {"x": 593, "y": 363}, {"x": 587, "y": 305}, {"x": 634, "y": 276}, {"x": 662, "y": 300}, {"x": 652, "y": 316}, {"x": 662, "y": 340}, {"x": 638, "y": 370}, {"x": 660, "y": 383}, {"x": 665, "y": 423}, {"x": 636, "y": 439}, {"x": 642, "y": 465}, {"x": 620, "y": 483}]}, {"regionId": "libya", "labelKey": "geo.country.libya", "polygon": [{"x": 649, "y": 601}, {"x": 631, "y": 610}, {"x": 620, "y": 579}, {"x": 629, "y": 561}, {"x": 623, "y": 485}, {"x": 642, "y": 470}, {"x": 638, "y": 436}, {"x": 665, "y": 427}, {"x": 667, "y": 398}, {"x": 696, "y": 410}, {"x": 712, "y": 403}, {"x": 772, "y": 427}, {"x": 776, "y": 450}, {"x": 850, "y": 483}, {"x": 874, "y": 470}, {"x": 870, "y": 438}, {"x": 894, "y": 421}, {"x": 956, "y": 438}, {"x": 952, "y": 655}, {"x": 936, "y": 657}, {"x": 928, "y": 688}, {"x": 867, "y": 690}, {"x": 863, "y": 737}, {"x": 662, "y": 630}]}, {"regionId": "egypt", "labelKey": "geo.country.egypt", "polygon": [{"x": 956, "y": 438}, {"x": 1052, "y": 458}, {"x": 1070, "y": 438}, {"x": 1105, "y": 432}, {"x": 1126, "y": 448}, {"x": 1148, "y": 438}, {"x": 1163, "y": 474}, {"x": 1150, "y": 521}, {"x": 1115, "y": 479}, {"x": 1168, "y": 597}, {"x": 1163, "y": 616}, {"x": 1137, "y": 626}, {"x": 1115, "y": 663}, {"x": 1101, "y": 659}, {"x": 952, "y": 652}]}, {"regionId": "sudan", "labelKey": "geo.country.sudan", "polygon": [{"x": 1159, "y": 612}, {"x": 1184, "y": 674}, {"x": 1184, "y": 694}, {"x": 1212, "y": 719}, {"x": 1221, "y": 768}, {"x": 1188, "y": 797}, {"x": 1179, "y": 844}, {"x": 1164, "y": 875}, {"x": 1137, "y": 901}, {"x": 1105, "y": 901}, {"x": 1079, "y": 946}, {"x": 1079, "y": 980}, {"x": 1056, "y": 964}, {"x": 1043, "y": 973}, {"x": 1021, "y": 960}, {"x": 983, "y": 933}, {"x": 941, "y": 933}, {"x": 919, "y": 955}, {"x": 878, "y": 941}, {"x": 856, "y": 931}, {"x": 830, "y": 895}, {"x": 810, "y": 890}, {"x": 841, "y": 830}, {"x": 861, "y": 826}, {"x": 859, "y": 739}, {"x": 868, "y": 685}, {"x": 925, "y": 690}, {"x": 936, "y": 655}, {"x": 1101, "y": 659}, {"x": 1119, "y": 666}, {"x": 1141, "y": 623}]}]}, {"mapId": "map.gcc", "assetId": "map.gcc", "imageWidth": 1220, "imageHeight": 1111, "regions": [{"regionId": "saudi_arabia", "labelKey": "geo.country.saudi_arabia", "polygon": [{"x": 49, "y": 214}, {"x": 95, "y": 224}, {"x": 123, "y": 183}, {"x": 176, "y": 177}, {"x": 193, "y": 148}, {"x": 163, "y": 85}, {"x": 266, "y": 56}, {"x": 335, "y": 77}, {"x": 361, "y": 108}, {"x": 377, "y": 101}, {"x": 483, "y": 198}, {"x": 544, "y": 201}, {"x": 552, "y": 230}, {"x": 608, "y": 236}, {"x": 623, "y": 273}, {"x": 660, "y": 282}, {"x": 671, "y": 325}, {"x": 692, "y": 323}, {"x": 769, "y": 504}, {"x": 808, "y": 524}, {"x": 798, "y": 537}, {"x": 798, "y": 545}, {"x": 803, "y": 561}, {"x": 840, "y": 621}, {"x": 1004, "y": 635}, {"x": 1015, "y": 674}, {"x": 964, "y": 759}, {"x": 665, "y": 833}, {"x": 623, "y": 872}, {"x": 591, "y": 901}, {"x": 573, "y": 880}, {"x": 491, "y": 864}, {"x": 406, "y": 872}, {"x": 407, "y": 930}, {"x": 393, "y": 931}, {"x": 308, "y": 758}, {"x": 258, "y": 732}, {"x": 229, "y": 687}, {"x": 224, "y": 626}, {"x": 45, "y": 275}, {"x": 20, "y": 280}]}, {"regionId": "kuwait", "labelKey": "geo.country.kuwait", "polygon": [{"x": 622, "y": 272}, {"x": 608, "y": 236}, {"x": 550, "y": 230}, {"x": 543, "y": 201}, {"x": 588, "y": 145}, {"x": 606, "y": 146}, {"x": 619, "y": 138}, {"x": 640, "y": 158}, {"x": 654, "y": 174}, {"x": 645, "y": 180}, {"x": 633, "y": 175}, {"x": 617, "y": 204}, {"x": 635, "y": 203}, {"x": 648, "y": 245}, {"x": 665, "y": 264}, {"x": 659, "y": 280}]}, {"regionId": "bahrain", "labelKey": "geo.country.bahrain", "polygon": [{"x": 756, "y": 421}, {"x": 731, "y": 370}, {"x": 752, "y": 347}, {"x": 775, "y": 381}, {"x": 765, "y": 415}]}, {"regionId": "qatar", "labelKey": "geo.country.qatar", "polygon": [{"x": 791, "y": 508}, {"x": 812, "y": 504}, {"x": 826, "y": 467}, {"x": 818, "y": 457}, {"x": 823, "y": 431}, {"x": 807, "y": 405}, {"x": 785, "y": 413}, {"x": 776, "y": 444}, {"x": 772, "y": 478}, {"x": 772, "y": 502}]}, {"regionId": "uae", "labelKey": "geo.country.uae", "polygon": [{"x": 810, "y": 520}, {"x": 825, "y": 531}, {"x": 825, "y": 552}, {"x": 846, "y": 553}, {"x": 887, "y": 552}, {"x": 921, "y": 558}, {"x": 966, "y": 537}, {"x": 987, "y": 500}, {"x": 1031, "y": 471}, {"x": 1048, "y": 441}, {"x": 1066, "y": 433}, {"x": 1069, "y": 412}, {"x": 1084, "y": 420}, {"x": 1084, "y": 436}, {"x": 1072, "y": 452}, {"x": 1082, "y": 467}, {"x": 1082, "y": 481}, {"x": 1063, "y": 484}, {"x": 1056, "y": 526}, {"x": 1032, "y": 542}, {"x": 1037, "y": 573}, {"x": 1008, "y": 600}, {"x": 1008, "y": 639}, {"x": 838, "y": 619}, {"x": 804, "y": 563}, {"x": 802, "y": 536}]}, {"regionId": "oman", "labelKey": "geo.country.oman", "polygon": [{"x": 1079, "y": 486}, {"x": 1085, "y": 512}, {"x": 1114, "y": 553}, {"x": 1146, "y": 566}, {"x": 1161, "y": 586}, {"x": 1174, "y": 606}, {"x": 1198, "y": 614}, {"x": 1174, "y": 653}, {"x": 1153, "y": 671}, {"x": 1140, "y": 698}, {"x": 1124, "y": 700}, {"x": 1103, "y": 738}, {"x": 1098, "y": 766}, {"x": 1108, "y": 801}, {"x": 1042, "y": 822}, {"x": 1023, "y": 861}, {"x": 973, "y": 878}, {"x": 957, "y": 907}, {"x": 933, "y": 906}, {"x": 839, "y": 938}, {"x": 775, "y": 804}, {"x": 965, "y": 759}, {"x": 1016, "y": 669}, {"x": 1005, "y": 637}, {"x": 1007, "y": 598}, {"x": 1039, "y": 574}, {"x": 1029, "y": 542}, {"x": 1055, "y": 526}, {"x": 1063, "y": 483}]}, {"regionId": "yemen", "labelKey": "geo.country.yemen", "polygon": [{"x": 839, "y": 938}, {"x": 807, "y": 952}, {"x": 801, "y": 973}, {"x": 775, "y": 975}, {"x": 682, "y": 1001}, {"x": 678, "y": 1010}, {"x": 606, "y": 1036}, {"x": 590, "y": 1026}, {"x": 458, "y": 1075}, {"x": 416, "y": 1013}, {"x": 394, "y": 933}, {"x": 407, "y": 928}, {"x": 403, "y": 869}, {"x": 493, "y": 867}, {"x": 572, "y": 882}, {"x": 591, "y": 904}, {"x": 622, "y": 872}, {"x": 669, "y": 827}, {"x": 776, "y": 806}]}]}, {"mapId": "map.gcc_mena", "assetId": "map.gcc_mena", "imageWidth": 1254, "imageHeight": 1254, "regions": [{"regionId": "jordan", "labelKey": "geo.country.jordan", "polygon": [{"x": 177, "y": 454}, {"x": 188, "y": 407}, {"x": 208, "y": 367}, {"x": 215, "y": 303}, {"x": 228, "y": 301}, {"x": 258, "y": 341}, {"x": 349, "y": 289}, {"x": 369, "y": 343}, {"x": 273, "y": 383}, {"x": 302, "y": 430}, {"x": 284, "y": 454}, {"x": 257, "y": 459}, {"x": 235, "y": 492}, {"x": 226, "y": 490}, {"x": 206, "y": 499}, {"x": 177, "y": 487}]}, {"regionId": "syria", "labelKey": "geo.country.syria", "polygon": [{"x": 349, "y": 285}, {"x": 433, "y": 243}, {"x": 453, "y": 187}, {"x": 447, "y": 153}, {"x": 487, "y": 118}, {"x": 478, "y": 107}, {"x": 444, "y": 125}, {"x": 422, "y": 118}, {"x": 362, "y": 149}, {"x": 333, "y": 133}, {"x": 289, "y": 147}, {"x": 277, "y": 138}, {"x": 273, "y": 156}, {"x": 260, "y": 185}, {"x": 266, "y": 211}, {"x": 269, "y": 231}, {"x": 244, "y": 261}, {"x": 228, "y": 278}, {"x": 228, "y": 301}, {"x": 260, "y": 341}]}, {"regionId": "lebanon", "labelKey": "geo.country.lebanon", "polygon": [{"x": 225, "y": 276}, {"x": 243, "y": 261}, {"x": 267, "y": 232}, {"x": 265, "y": 209}, {"x": 259, "y": 185}, {"x": 236, "y": 182}, {"x": 225, "y": 207}, {"x": 225, "y": 222}, {"x": 207, "y": 265}, {"x": 207, "y": 276}]}, {"regionId": "palestine", "labelKey": "geo.country.palestine", "polygon": [{"x": 223, "y": 276}, {"x": 230, "y": 305}, {"x": 216, "y": 305}, {"x": 210, "y": 369}, {"x": 189, "y": 410}, {"x": 178, "y": 456}, {"x": 158, "y": 385}, {"x": 199, "y": 274}]}, {"regionId": "saudi_arabia", "labelKey": "geo.country.saudi_arabia", "polygon": [{"x": 366, "y": 340}, {"x": 379, "y": 336}, {"x": 441, "y": 367}, {"x": 465, "y": 403}, {"x": 492, "y": 416}, {"x": 559, "y": 488}, {"x": 644, "y": 497}, {"x": 655, "y": 508}, {"x": 686, "y": 508}, {"x": 697, "y": 536}, {"x": 744, "y": 536}, {"x": 764, "y": 579}, {"x": 795, "y": 586}, {"x": 804, "y": 608}, {"x": 790, "y": 626}, {"x": 866, "y": 772}, {"x": 998, "y": 792}, {"x": 996, "y": 823}, {"x": 958, "y": 906}, {"x": 860, "y": 951}, {"x": 711, "y": 993}, {"x": 639, "y": 1091}, {"x": 634, "y": 1078}, {"x": 562, "y": 1058}, {"x": 529, "y": 1069}, {"x": 503, "y": 1060}, {"x": 497, "y": 1071}, {"x": 497, "y": 1082}, {"x": 476, "y": 1103}, {"x": 456, "y": 1046}, {"x": 412, "y": 997}, {"x": 411, "y": 977}, {"x": 386, "y": 947}, {"x": 377, "y": 907}, {"x": 344, "y": 893}, {"x": 313, "y": 851}, {"x": 305, "y": 822}, {"x": 308, "y": 804}, {"x": 277, "y": 723}, {"x": 241, "y": 709}, {"x": 233, "y": 690}, {"x": 239, "y": 680}, {"x": 166, "y": 545}, {"x": 146, "y": 546}, {"x": 178, "y": 454}, {"x": 178, "y": 488}, {"x": 199, "y": 501}, {"x": 225, "y": 488}, {"x": 234, "y": 495}, {"x": 258, "y": 456}, {"x": 284, "y": 453}, {"x": 300, "y": 429}, {"x": 270, "y": 382}]}, {"regionId": "kuwait", "labelKey": "geo.country.kuwait", "polygon": [{"x": 640, "y": 499}, {"x": 675, "y": 443}, {"x": 714, "y": 439}, {"x": 737, "y": 454}, {"x": 717, "y": 454}, {"x": 746, "y": 537}, {"x": 698, "y": 538}, {"x": 689, "y": 507}, {"x": 657, "y": 510}]}, {"regionId": "bahrain", "labelKey": "geo.country.bahrain", "polygon": [{"x": 826, "y": 655}, {"x": 820, "y": 612}, {"x": 835, "y": 598}, {"x": 849, "y": 632}, {"x": 843, "y": 665}]}, {"regionId": "qatar", "labelKey": "geo.country.qatar", "polygon": [{"x": 835, "y": 707}, {"x": 845, "y": 704}, {"x": 843, "y": 690}, {"x": 863, "y": 640}, {"x": 879, "y": 634}, {"x": 896, "y": 652}, {"x": 898, "y": 694}, {"x": 860, "y": 727}]}, {"regionId": "uae", "labelKey": "geo.country.uae", "polygon": [{"x": 831, "y": 709}, {"x": 860, "y": 735}, {"x": 881, "y": 726}, {"x": 902, "y": 724}, {"x": 959, "y": 723}, {"x": 985, "y": 705}, {"x": 991, "y": 688}, {"x": 1049, "y": 627}, {"x": 1062, "y": 638}, {"x": 1054, "y": 680}, {"x": 1032, "y": 698}, {"x": 1027, "y": 727}, {"x": 1013, "y": 741}, {"x": 999, "y": 793}, {"x": 867, "y": 773}]}, {"regionId": "oman", "labelKey": "geo.country.oman", "polygon": [{"x": 1052, "y": 680}, {"x": 1071, "y": 724}, {"x": 1151, "y": 755}, {"x": 1197, "y": 808}, {"x": 1151, "y": 877}, {"x": 1144, "y": 868}, {"x": 1119, "y": 905}, {"x": 1127, "y": 932}, {"x": 1096, "y": 947}, {"x": 1085, "y": 985}, {"x": 1051, "y": 999}, {"x": 1043, "y": 1018}, {"x": 1012, "y": 1018}, {"x": 999, "y": 1050}, {"x": 971, "y": 1043}, {"x": 915, "y": 1069}, {"x": 859, "y": 954}, {"x": 959, "y": 908}, {"x": 995, "y": 829}, {"x": 999, "y": 793}, {"x": 1009, "y": 741}, {"x": 1026, "y": 727}, {"x": 1030, "y": 696}]}, {"regionId": "yemen", "labelKey": "geo.country.yemen", "polygon": [{"x": 913, "y": 1066}, {"x": 901, "y": 1066}, {"x": 842, "y": 1096}, {"x": 824, "y": 1119}, {"x": 801, "y": 1122}, {"x": 765, "y": 1128}, {"x": 742, "y": 1146}, {"x": 717, "y": 1150}, {"x": 682, "y": 1170}, {"x": 659, "y": 1153}, {"x": 661, "y": 1144}, {"x": 647, "y": 1130}, {"x": 647, "y": 1110}, {"x": 640, "y": 1097}, {"x": 710, "y": 993}, {"x": 856, "y": 952}]}]}, {"mapId": "map.levant", "assetId": "map.levant", "imageWidth": 1233, "imageHeight": 1276, "regions": [{"regionId": "syria", "labelKey": "geo.country.syria", "polygon": [{"x": 350, "y": 471}, {"x": 330, "y": 436}, {"x": 343, "y": 397}, {"x": 330, "y": 368}, {"x": 314, "y": 347}, {"x": 343, "y": 303}, {"x": 373, "y": 318}, {"x": 378, "y": 296}, {"x": 389, "y": 290}, {"x": 393, "y": 261}, {"x": 423, "y": 259}, {"x": 410, "y": 233}, {"x": 421, "y": 174}, {"x": 448, "y": 176}, {"x": 465, "y": 201}, {"x": 498, "y": 201}, {"x": 522, "y": 209}, {"x": 567, "y": 190}, {"x": 624, "y": 159}, {"x": 668, "y": 194}, {"x": 701, "y": 192}, {"x": 726, "y": 205}, {"x": 772, "y": 201}, {"x": 853, "y": 168}, {"x": 921, "y": 129}, {"x": 980, "y": 144}, {"x": 1030, "y": 142}, {"x": 1106, "y": 122}, {"x": 1119, "y": 96}, {"x": 1138, "y": 113}, {"x": 1139, "y": 139}, {"x": 1067, "y": 214}, {"x": 1016, "y": 220}, {"x": 986, "y": 272}, {"x": 1006, "y": 312}, {"x": 1006, "y": 338}, {"x": 980, "y": 392}, {"x": 986, "y": 438}, {"x": 956, "y": 495}, {"x": 929, "y": 503}, {"x": 434, "y": 769}, {"x": 408, "y": 765}, {"x": 380, "y": 750}, {"x": 367, "y": 748}, {"x": 330, "y": 719}, {"x": 332, "y": 697}, {"x": 326, "y": 687}, {"x": 330, "y": 671}, {"x": 321, "y": 654}, {"x": 347, "y": 615}, {"x": 336, "y": 599}, {"x": 352, "y": 578}, {"x": 371, "y": 578}, {"x": 384, "y": 558}, {"x": 400, "y": 556}, {"x": 413, "y": 530}, {"x": 408, "y": 512}, {"x": 398, "y": 491}, {"x": 384, "y": 486}, {"x": 395, "y": 473}, {"x": 384, "y": 460}]}, {"regionId": "lebanon", "labelKey": "geo.country.lebanon", "polygon": [{"x": 353, "y": 469}, {"x": 316, "y": 499}, {"x": 292, "y": 527}, {"x": 298, "y": 554}, {"x": 272, "y": 571}, {"x": 248, "y": 650}, {"x": 226, "y": 698}, {"x": 259, "y": 697}, {"x": 289, "y": 676}, {"x": 322, "y": 654}, {"x": 344, "y": 613}, {"x": 333, "y": 602}, {"x": 350, "y": 576}, {"x": 370, "y": 576}, {"x": 379, "y": 560}, {"x": 410, "y": 530}, {"x": 409, "y": 512}, {"x": 386, "y": 484}, {"x": 390, "y": 469}, {"x": 386, "y": 460}]}, {"regionId": "jordan", "labelKey": "geo.country.jordan", "polygon": [{"x": 329, "y": 717}, {"x": 353, "y": 733}, {"x": 364, "y": 746}, {"x": 383, "y": 752}, {"x": 405, "y": 770}, {"x": 436, "y": 770}, {"x": 688, "y": 634}, {"x": 726, "y": 737}, {"x": 713, "y": 745}, {"x": 721, "y": 765}, {"x": 745, "y": 759}, {"x": 754, "y": 774}, {"x": 738, "y": 789}, {"x": 475, "y": 870}, {"x": 586, "y": 992}, {"x": 540, "y": 1016}, {"x": 521, "y": 1059}, {"x": 429, "y": 1072}, {"x": 403, "y": 1114}, {"x": 383, "y": 1125}, {"x": 351, "y": 1158}, {"x": 220, "y": 1140}, {"x": 224, "y": 1107}, {"x": 237, "y": 1072}, {"x": 239, "y": 1042}, {"x": 246, "y": 994}, {"x": 274, "y": 940}, {"x": 276, "y": 909}, {"x": 296, "y": 841}, {"x": 290, "y": 817}, {"x": 298, "y": 782}, {"x": 300, "y": 726}]}, {"regionId": "palestine", "labelKey": "geo.country.palestine", "polygon": [{"x": 314, "y": 650}, {"x": 289, "y": 680}, {"x": 261, "y": 702}, {"x": 224, "y": 697}, {"x": 170, "y": 841}, {"x": 135, "y": 876}, {"x": 200, "y": 1096}, {"x": 196, "y": 1140}, {"x": 207, "y": 1160}, {"x": 222, "y": 1140}, {"x": 222, "y": 1109}, {"x": 239, "y": 1070}, {"x": 237, "y": 1040}, {"x": 246, "y": 1000}, {"x": 276, "y": 933}, {"x": 276, "y": 905}, {"x": 298, "y": 846}, {"x": 287, "y": 815}, {"x": 300, "y": 783}, {"x": 300, "y": 722}, {"x": 331, "y": 722}, {"x": 329, "y": 676}]}]}]}, "internalTitle": "Select on map", "familyId": "geography", "categoryId": "geography.select_on_map", "difficulty": "medium", "instructionAr": "اختر الدولة على الخريطة.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.map.a11y_fallback", "requiredAssetIds": ["map.africa", "map.gcc", "map.gcc_mena", "map.levant"]}'::jsonb,
    md5('geography.select_on_map.v1'),
    'pack 31-38 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;


  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_odd_tid, 'focus.odd_one_out', 'focus', 'focus.odd_one_out', 'Odd one out', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_odd_tid FROM content_templates WHERE slug = 'focus.odd_one_out';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd18', v_odd_tid, 1, 'published',
    '{"definitionId": "focus.odd_one_out.dev", "definitionVersion": 1, "engineId": "focus.odd_one_out", "durationMs": 6000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.odd.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.focus", "promptKey": "challenge.odd.prompt", "footerKey": "challenge.odd.footer", "columns": 4, "glyphKeys": ["pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.b", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a"]}, "serverConfig": {"columns": 4, "glyphKeys": ["pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.b", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a"], "oddIndex": 9, "variants": [{"columns": 4, "glyphKeys": ["pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.b", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a"], "oddIndex": 9}, {"columns": 4, "glyphKeys": ["pulse.a", "pulse.a", "pulse.a", "pulse.b", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a", "pulse.a"], "oddIndex": 3}]}, "internalTitle": "Odd one out", "familyId": "focus", "categoryId": "focus.odd_one_out", "difficulty": "easy", "instructionAr": "جد الشكل المختلف.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.odd.a11y_fallback", "requiredAssetIds": []}'::jsonb,
    md5('focus.odd_one_out.v1'),
    'pack 31-38 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;


  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_order_tid, 'order.sequence_sort', 'order', 'order.sequence_sort', 'Sequence sort', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_order_tid FROM content_templates WHERE slug = 'order.sequence_sort';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd19', v_order_tid, 1, 'published',
    '{"definitionId": "order.sequence_sort.dev", "definitionVersion": 1, "engineId": "order.sequence_sort", "durationMs": 8000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.order.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.order", "promptKey": "challenge.order.prompt", "footerKey": "challenge.order.footer", "itemKeys": ["num.4", "num.9", "num.2", "num.7"], "ascending": true}, "serverConfig": {"itemKeys": ["num.4", "num.9", "num.2", "num.7"], "correctOrder": ["num.2", "num.4", "num.7", "num.9"], "ascending": true, "variants": [{"itemKeys": ["num.4", "num.9", "num.2", "num.7"], "correctOrder": ["num.2", "num.4", "num.7", "num.9"], "ascending": true}, {"itemKeys": ["num.5", "num.1", "num.8", "num.3"], "correctOrder": ["num.1", "num.3", "num.5", "num.8"], "ascending": true}]}, "internalTitle": "Sequence sort", "familyId": "order", "categoryId": "order.sequence_sort", "difficulty": "medium", "instructionAr": "رتّب الأرقام تصاعدياً.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.order.a11y_fallback", "requiredAssetIds": []}'::jsonb,
    md5('order.sequence_sort.v1'),
    'pack 31-38 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;


  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_maze_tid, 'precision.maze_path', 'precision', 'precision.maze_path', 'Maze path', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_maze_tid FROM content_templates WHERE slug = 'precision.maze_path';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd20', v_maze_tid, 1, 'published',
    '{"definitionId": "precision.maze_path.dev", "definitionVersion": 1, "engineId": "precision.maze_path", "durationMs": 8000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.maze.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.precision", "promptKey": "challenge.maze.prompt", "footerKey": "challenge.maze.footer", "cols": 5, "rows": 5, "cells": [1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1], "startIndex": 0, "goalIndex": 24}, "serverConfig": {"cols": 5, "rows": 5, "cells": [1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 1, 1], "startIndex": 0, "goalIndex": 24}, "internalTitle": "Maze path", "familyId": "precision", "categoryId": "precision.maze_path", "difficulty": "medium", "instructionAr": "ارسم المسار دون لمس الجدران.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.maze.a11y_fallback", "requiredAssetIds": []}'::jsonb,
    md5('precision.maze_path.v1'),
    'pack 31-38 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;


  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_bal_tid, 'logic.balance_scale', 'logic', 'logic.balance_scale', 'Balance scale', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_bal_tid FROM content_templates WHERE slug = 'logic.balance_scale';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd21', v_bal_tid, 1, 'published',
    '{"definitionId": "logic.balance_scale.dev", "definitionVersion": 1, "engineId": "logic.balance_scale", "durationMs": 8000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.balance.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.logic", "promptKey": "challenge.balance.prompt", "footerKey": "challenge.balance.footer", "leftWeights": [1, 2], "rightKnownWeights": [1], "optionWeights": [1, 2, 3]}, "serverConfig": {"leftWeights": [1, 2], "rightKnownWeights": [1], "optionWeights": [1, 2, 3], "correctWeight": 2, "variants": [{"leftWeights": [1, 2], "rightKnownWeights": [1], "optionWeights": [1, 2, 3], "correctWeight": 2}, {"leftWeights": [3], "rightKnownWeights": [], "optionWeights": [1, 2, 3], "correctWeight": 3}]}, "internalTitle": "Balance scale", "familyId": "logic", "categoryId": "logic.balance_scale", "difficulty": "medium", "instructionAr": "اختر الوزن الصحيح.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.balance.a11y_fallback", "requiredAssetIds": []}'::jsonb,
    md5('logic.balance_scale.v1'),
    'pack 31-38 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;


  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_stroop_tid, 'focus.stroop', 'focus', 'focus.stroop', 'Stroop', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_stroop_tid FROM content_templates WHERE slug = 'focus.stroop';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd22', v_stroop_tid, 1, 'published',
    '{"definitionId": "focus.stroop.dev", "definitionVersion": 1, "engineId": "focus.stroop", "durationMs": 6000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.stroop.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.focus", "promptKey": "challenge.stroop.prompt", "footerKey": "challenge.stroop.footer", "wordKey": "color.red", "inkColorId": "cyan", "optionKeys": ["cyan", "red", "yellow"]}, "serverConfig": {"wordKey": "color.red", "inkColorId": "cyan", "optionKeys": ["cyan", "red", "yellow"], "correctOptionKey": "cyan", "variants": [{"wordKey": "color.red", "inkColorId": "cyan", "optionKeys": ["cyan", "red", "yellow"], "correctOptionKey": "cyan"}, {"wordKey": "color.blue", "inkColorId": "yellow", "optionKeys": ["cyan", "red", "yellow"], "correctOptionKey": "yellow"}]}, "internalTitle": "Stroop", "familyId": "focus", "categoryId": "focus.stroop", "difficulty": "hard", "instructionAr": "اختر لون الحبر لا معنى الكلمة.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.stroop.a11y_fallback", "requiredAssetIds": []}'::jsonb,
    md5('focus.stroop.v1'),
    'pack 31-38 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;


  INSERT INTO content_templates (id, slug, family_id, category_id, internal_title, status)
  VALUES (v_search_tid, 'search.select_occurrences', 'search', 'search.select_occurrences', 'Select occurrences', 'published')
  ON CONFLICT (slug) DO UPDATE SET status = 'published';
  SELECT id INTO v_search_tid FROM content_templates WHERE slug = 'search.select_occurrences';

  INSERT INTO content_template_versions (
    id, template_id, version, status, definition, validation_hash, validation_notes, approved_at
  ) VALUES (
    'dddddddd-dddd-4ddd-8ddd-dddddddddd23', v_search_tid, 1, 'published',
    '{"definitionId": "search.select_occurrences.dev", "definitionVersion": 1, "engineId": "search.select_occurrences", "durationMs": 8000, "heartPenaltyOnFailure": 1, "energyRewardOnSuccess": 1, "promptKey": "challenge.search.intro", "choiceKeys": [], "clientConfig": {"categoryKey": "challenge.category.search", "promptKey": "challenge.search.prompt", "footerKey": "challenge.search.footer", "columns": 4, "cells": ["3", "8", "0", "5", "2", "9", "6", "8", "0", "5", "8", "2", "9", "3", "6", "0", "8", "5", "2", "9"], "targetValue": "8"}, "serverConfig": {"columns": 4, "cells": ["3", "8", "0", "5", "2", "9", "6", "8", "0", "5", "8", "2", "9", "3", "6", "0", "8", "5", "2", "9"], "targetValue": "8", "requiredIndices": [1, 7, 10, 16]}, "internalTitle": "Select occurrences", "familyId": "search", "categoryId": "search.select_occurrences", "difficulty": "medium", "instructionAr": "اختر كل الخلايا المطابقة.", "eligibleModes": ["quick_survival", "private", "training", "dev"], "selectionWeight": 100, "repetitionCooldownRounds": 1, "minAppVersion": "0.0.0", "requiredCapabilities": [], "accessibilityFallbackKey": "challenge.search.a11y_fallback", "requiredAssetIds": []}'::jsonb,
    md5('search.select_occurrences.v1'),
    'pack 31-38 seed',
    now()
  ) ON CONFLICT (id) DO NOTHING;


  SELECT ctv.id INTO v_wait_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'reaction.wait_for_signal' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_trap_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'trap.no_touch' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_swipe_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'gesture.reverse_swipe' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_tap_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'tap.precision' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_mem_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'memory.sequence' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_hold_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'hold.multitouch' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_shake_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'motion.shake' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_tilt_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'motion.tilt_balance' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_audio_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'audio.cue' AND ctv.version = 1 LIMIT 1;


  SELECT ctv.id INTO v_pair_vid
  FROM content_template_versions ctv
  JOIN content_templates ct ON ct.id = ctv.template_id
  WHERE ct.slug = 'social.pair_sync' AND ctv.version = 1 LIMIT 1;

  SELECT id INTO v_trivia_vid FROM content_template_versions WHERE template_id = v_trivia_tid AND version = 1;
  SELECT id INTO v_geo_vid FROM content_template_versions WHERE template_id = v_geo_tid AND version = 1;
  SELECT id INTO v_odd_vid FROM content_template_versions WHERE template_id = v_odd_tid AND version = 1;
  SELECT id INTO v_order_vid FROM content_template_versions WHERE template_id = v_order_tid AND version = 1;
  SELECT id INTO v_maze_vid FROM content_template_versions WHERE template_id = v_maze_tid AND version = 1;
  SELECT id INTO v_bal_vid FROM content_template_versions WHERE template_id = v_bal_tid AND version = 1;
  SELECT id INTO v_stroop_vid FROM content_template_versions WHERE template_id = v_stroop_tid AND version = 1;
  SELECT id INTO v_search_vid FROM content_template_versions WHERE template_id = v_search_tid AND version = 1;

  IF v_wait_vid IS NULL OR v_trap_vid IS NULL OR v_swipe_vid IS NULL
     OR v_tap_vid IS NULL OR v_mem_vid IS NULL OR v_hold_vid IS NULL
     OR v_shake_vid IS NULL OR v_tilt_vid IS NULL OR v_audio_vid IS NULL
     OR v_pair_vid IS NULL
     OR v_trivia_vid IS NULL OR v_geo_vid IS NULL OR v_odd_vid IS NULL
     OR v_order_vid IS NULL OR v_maze_vid IS NULL OR v_bal_vid IS NULL
     OR v_stroop_vid IS NULL OR v_search_vid IS NULL THEN
    RAISE EXCEPTION 'pack 31-38: missing template versions; cannot publish catalog';
  END IF;


  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_catalog_release_id,
    'challenge_catalog',
    'lh.pack31_38.v1',
    jsonb_build_object(
      'releaseId', v_catalog_release_id,
      'versionLabel', 'lh.pack31_38.v1',
      'entries', jsonb_build_array(
        jsonb_build_object('templateVersionId', v_wait_vid, 'definitionId', 'reaction.wait_for_signal.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_trap_vid, 'definitionId', 'trap.no_touch.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_shake_vid, 'definitionId', 'motion.shake.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_tilt_vid, 'definitionId', 'motion.tilt_balance.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_swipe_vid, 'definitionId', 'gesture.reverse_swipe.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_tap_vid, 'definitionId', 'tap.precision.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_mem_vid, 'definitionId', 'memory.sequence.dev', 'weight', 100, 'repetitionCooldownRounds', 2, 'paused', false),
        jsonb_build_object('templateVersionId', v_audio_vid, 'definitionId', 'audio.cue.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_pair_vid, 'definitionId', 'social.pair_sync.dev', 'weight', 100, 'repetitionCooldownRounds', 2, 'paused', false),
        jsonb_build_object('templateVersionId', v_hold_vid, 'definitionId', 'hold.multitouch.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_trivia_vid, 'definitionId', 'trivia.multiple_choice.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_geo_vid, 'definitionId', 'geography.select_on_map.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_odd_vid, 'definitionId', 'focus.odd_one_out.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_order_vid, 'definitionId', 'order.sequence_sort.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_maze_vid, 'definitionId', 'precision.maze_path.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_bal_vid, 'definitionId', 'logic.balance_scale.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_stroop_vid, 'definitionId', 'focus.stroop.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false),
        jsonb_build_object('templateVersionId', v_search_vid, 'definitionId', 'search.select_occurrences.dev', 'weight', 100, 'repetitionCooldownRounds', 1, 'paused', false)
      ),
      'changelog', 'Challenges 31-38 pack; risk choice remains paused'
    ),
    'Challenges 31-38 mixed catalog'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_releases (id, kind, version_label, payload, changelog)
  VALUES (
    v_loc_release_id,
    'localization',
    'lh.pack31_38.v1',
    '{"releaseId": "dddddddd-dddd-4ddd-8ddd-dddddddddd17", "versionLabel": "lh.pack31_38.v1", "locales": ["ar", "en"], "entries": {"ar": {"challenge.trivia.intro": "اختر الإجابة", "challenge.trivia.prompt": "ما الإجابة الصحيحة؟", "challenge.trivia.footer": "اختيار واحد فقط", "challenge.map.intro": "اختر على الخريطة", "challenge.map.prompt": "أين تقع {country}؟", "challenge.map.footer": "اضغط داخل حدود الدولة", "challenge.odd.intro": "الشكل المختلف", "challenge.odd.prompt": "اضغط على المختلف", "challenge.odd.footer": "شكل واحد فقط يختلف", "challenge.order.intro": "رتّب التسلسل", "challenge.order.prompt": "رتّب تصاعدياً", "challenge.order.footer": "اسحب إلى الخانات", "challenge.maze.intro": "المتاهة", "challenge.maze.prompt": "ارسم المسار إلى الهدف", "challenge.maze.footer": "لا تلمس الجدران", "challenge.balance.intro": "ميزان الأوزان", "challenge.balance.prompt": "وازن الميزان", "challenge.balance.footer": "اسحب الوزن الصحيح", "challenge.stroop.intro": "لون الحبر", "challenge.stroop.prompt": "ما لون الكتابة؟", "challenge.stroop.footer": "تجاهل معنى الكلمة", "challenge.search.intro": "ابحث عن التطابق", "challenge.search.prompt": "اختر كل خانات {value}", "challenge.search.footer": "أي خطأ ينهي التحدي", "challenge.category.trivia": "أسئلة", "challenge.category.geography": "جغرافيا", "challenge.category.focus": "تركيز", "challenge.category.order": "ترتيب", "challenge.category.precision": "دقة", "challenge.category.logic": "منطق", "challenge.category.search": "بحث", "trivia.q.japan_capital": "ما عاصمة اليابان؟", "trivia.q.egypt_capital": "ما عاصمة مصر؟", "trivia.opt.osaka": "أوساكا", "trivia.opt.tokyo": "طوكيو", "trivia.opt.seoul": "سيول", "trivia.opt.kyoto": "كيوتو", "trivia.opt.cairo": "القاهرة", "trivia.opt.alex": "الإسكندرية", "trivia.opt.giza": "الجيزة", "trivia.opt.aswan": "أسوان", "result.trivia.wrong": "إجابة خاطئة", "result.map.wrong": "دولة خاطئة", "result.focus.wrong": "اختيار خاطئ", "result.order.invalid": "ترتيب غير صالح", "result.order.wrong": "ترتيب خاطئ", "result.maze.failed": "خرجت عن المسار", "result.balance.wrong": "وزن خاطئ", "result.stroop.wrong": "لون خاطئ", "result.search.wrong": "خلية خاطئة", "result.search.incomplete": "لم تُكمل كل التطابقات", "color.red": "أحمر", "color.blue": "أزرق", "num.1": "١", "num.2": "٢", "num.3": "٣", "num.4": "٤", "num.5": "٥", "num.7": "٧", "num.8": "٨", "num.9": "٩", "cyan": "سماوي", "red": "أحمر", "yellow": "أصفر", "geo.country.mauritania": "موريتانيا", "geo.country.algeria": "الجزائر", "geo.country.morocco": "المغرب", "geo.country.tunisia": "تونس", "geo.country.libya": "ليبيا", "geo.country.egypt": "مصر", "geo.country.sudan": "السودان", "geo.country.saudi_arabia": "السعودية", "geo.country.kuwait": "الكويت", "geo.country.bahrain": "البحرين", "geo.country.qatar": "قطر", "geo.country.uae": "الإمارات", "geo.country.oman": "عمان", "geo.country.yemen": "اليمن", "geo.country.jordan": "الأردن", "geo.country.syria": "سوريا", "geo.country.lebanon": "لبنان", "geo.country.palestine": "فلسطين"}, "en": {"challenge.trivia.intro": "Pick the answer", "challenge.trivia.prompt": "What is the correct answer?", "challenge.trivia.footer": "One choice only", "challenge.map.intro": "Find on the map", "challenge.map.prompt": "Where is {country}?", "challenge.map.footer": "Tap inside the country", "challenge.odd.intro": "Odd one out", "challenge.odd.prompt": "Tap the different one", "challenge.odd.footer": "Only one shape differs", "challenge.order.intro": "Sort the sequence", "challenge.order.prompt": "Sort ascending", "challenge.order.footer": "Drag into the slots", "challenge.maze.intro": "Maze", "challenge.maze.prompt": "Trace the path to the goal", "challenge.maze.footer": "Do not touch walls", "challenge.balance.intro": "Balance scale", "challenge.balance.prompt": "Balance the scale", "challenge.balance.footer": "Drag the correct weight", "challenge.stroop.intro": "Ink color", "challenge.stroop.prompt": "What color is the ink?", "challenge.stroop.footer": "Ignore the word meaning", "challenge.search.intro": "Find matches", "challenge.search.prompt": "Select every {value}", "challenge.search.footer": "Any wrong tap ends it", "challenge.category.trivia": "Trivia", "challenge.category.geography": "Geography", "challenge.category.focus": "Focus", "challenge.category.order": "Order", "challenge.category.precision": "Precision", "challenge.category.logic": "Logic", "challenge.category.search": "Search", "trivia.q.japan_capital": "What is the capital of Japan?", "trivia.q.egypt_capital": "What is the capital of Egypt?", "trivia.opt.osaka": "Osaka", "trivia.opt.tokyo": "Tokyo", "trivia.opt.seoul": "Seoul", "trivia.opt.kyoto": "Kyoto", "trivia.opt.cairo": "Cairo", "trivia.opt.alex": "Alexandria", "trivia.opt.giza": "Giza", "trivia.opt.aswan": "Aswan", "result.trivia.wrong": "Wrong answer", "result.map.wrong": "Wrong country", "result.focus.wrong": "Wrong selection", "result.order.invalid": "Invalid order", "result.order.wrong": "Wrong order", "result.maze.failed": "Off the path", "result.balance.wrong": "Wrong weight", "result.stroop.wrong": "Wrong color", "result.search.wrong": "Wrong cell", "result.search.incomplete": "Not all matches selected", "color.red": "Red", "color.blue": "Blue", "num.1": "1", "num.2": "2", "num.3": "3", "num.4": "4", "num.5": "5", "num.7": "7", "num.8": "8", "num.9": "9", "cyan": "Cyan", "red": "Red", "yellow": "Yellow", "geo.country.mauritania": "Mauritania", "geo.country.algeria": "Algeria", "geo.country.morocco": "Morocco", "geo.country.tunisia": "Tunisia", "geo.country.libya": "Libya", "geo.country.egypt": "Egypt", "geo.country.sudan": "Sudan", "geo.country.saudi_arabia": "Saudi Arabia", "geo.country.kuwait": "Kuwait", "geo.country.bahrain": "Bahrain", "geo.country.qatar": "Qatar", "geo.country.uae": "UAE", "geo.country.oman": "Oman", "geo.country.yemen": "Yemen", "geo.country.jordan": "Jordan", "geo.country.syria": "Syria", "geo.country.lebanon": "Lebanon", "geo.country.palestine": "Palestine"}}}'::jsonb,
    'Challenges 31-38 localization'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('challenge_catalog', v_catalog_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();

  INSERT INTO content_current_releases (kind, release_id)
  VALUES ('localization', v_loc_release_id)
  ON CONFLICT (kind) DO UPDATE SET release_id = EXCLUDED.release_id, updated_at = now();
END $$;

