-- Importa ricette e procedure originali ricavate da titoli e ingredienti, senza dosi.
-- household_id punta alla casa di Jacopo e Martina.

begin;

create temporary table maja_import_settings (
  household_id text not null
) on commit drop;

insert into maja_import_settings (household_id)
values ('43c15ac3-0745-43a5-830d-ec03f63c0bcd');

create temporary table maja_recipe_seed (
  title text primary key,
  category text not null,
  ingredients text[] not null,
  tags text[] not null default '{}',
  excluded_from_plan boolean not null default false
) on commit drop;

insert into maja_recipe_seed (title, category, ingredients, tags, excluded_from_plan) values
  ('Sugo di pomodoro', 'other', array['Olio extravergine', 'Aglio', 'Cipolla', 'Sedano', 'Carote', 'Passata di pomodoro', 'Prezzemolo', 'Basilico'], array[]::text[], true),
  ('Pasta alla carrettiera', 'lunch', array['Pasta', 'Olio extravergine', 'Aglio', 'Acciughe', 'Passata di pomodoro', 'Capperi', 'Olive', 'Origano', 'Peperoncino', 'Prezzemolo'], array[]::text[], false),
  ('Pasta o riso con verdure', 'lunch', array['Pasta', 'Riso', 'Zucchine', 'Melanzane', 'Peperoni', 'Asparagi', 'Carciofi', 'Funghi', 'Aglio', 'Olio extravergine', 'Formaggio grattugiato', 'Prezzemolo'], array['vegetariano'], false),
  ('Insalata di pasta o riso', 'lunch', array['Pasta', 'Riso', 'Zucchine', 'Pomodori', 'Peperoni', 'Funghi', 'Tonno', 'Tofu', 'Olio extravergine', 'Prezzemolo', 'Basilico'], array[]::text[], false),
  ('Insalata vegetariana di pasta o riso', 'lunch', array['Pasta', 'Riso', 'Pomodori', 'Radicchio', 'Rucola', 'Lattuga', 'Scarola', 'Ravanelli', 'Cetrioli', 'Funghi', 'Piselli', 'Mais', 'Lenticchie', 'Fagioli', 'Olio extravergine'], array['vegetariano'], false),
  ('Tabulè freddo estivo', 'lunch', array['Cous cous', 'Limone', 'Pomodorini', 'Peperoni', 'Menta', 'Basilico', 'Olio extravergine'], array['vegetariano'], false),
  ('Pasta e piselli', 'lunch', array['Pasta', 'Piselli', 'Cipolla', 'Scalogno', 'Olio extravergine', 'Parmigiano'], array['vegetariano'], false),
  ('Cous cous con verdure e legumi', 'lunch', array['Cous cous', 'Aglio', 'Peperoncino', 'Cipolla', 'Carote', 'Melanzane', 'Zucchine', 'Pomodorini', 'Ceci', 'Harissa', 'Olio extravergine'], array['vegano'], false),
  ('Riso in bianco alle erbe', 'lunch', array['Riso', 'Olio extravergine', 'Rosmarino', 'Prezzemolo', 'Basilico'], array['vegetariano'], false),
  ('Riso e fagioli', 'lunch', array['Riso', 'Fagioli', 'Cipolla', 'Pomodori', 'Carote', 'Sedano', 'Erba cipollina', 'Basilico', 'Formaggio grattugiato', 'Ceci', 'Lenticchie', 'Olio extravergine'], array['vegetariano'], false),
  ('Zuppa di verdure italiana', 'lunch', array['Ortaggi di stagione', 'Dado vegetale', 'Crusca', 'Olio extravergine', 'Pane', 'Pasta', 'Riso', 'Orzo'], array['vegetariano'], false),
  ('Lenticchie in minestra', 'lunch', array['Lenticchie', 'Olio extravergine', 'Cipolla', 'Sedano', 'Carote', 'Aglio', 'Prezzemolo', 'Passata di pomodoro', 'Brodo vegetale', 'Pane', 'Fagioli', 'Ceci'], array['vegano'], false),
  ('Legumi in padella', 'other', array['Legumi misti', 'Olio extravergine', 'Aglio', 'Pomodori', 'Prezzemolo', 'Erba cipollina', 'Peperoncino', 'Uova', 'Pane'], array[]::text[], true),
  ('Pasta e ceci', 'lunch', array['Pasta', 'Ceci', 'Aglio', 'Rosmarino', 'Olio extravergine', 'Peperoncino'], array['vegano'], false),
  ('Pasta e fagioli estiva', 'lunch', array['Pasta', 'Fagioli', 'Carote', 'Sedano', 'Prezzemolo', 'Olio extravergine'], array['vegano'], false),
  ('Pasta alla Norma', 'lunch', array['Pasta', 'Melanzane', 'Aglio', 'Basilico', 'Passata di pomodoro', 'Olio extravergine', 'Ricotta salata', 'Parmigiano', 'Pecorino'], array['vegetariano'], false),
  ('Riso freddo con salmone, zucchine e limone', 'lunch', array['Riso', 'Zucchine', 'Salmone affumicato', 'Limone', 'Origano', 'Basilico', 'Olio extravergine'], array[]::text[], false),
  ('Calamarata alla pescatora', 'lunch', array['Pasta', 'Calamari', 'Pomodorini', 'Passata di pomodoro', 'Aglio', 'Vino bianco', 'Prezzemolo', 'Olio extravergine'], array[]::text[], false),

  ('Pizzaiola', 'dinner', array['Carne a scelta', 'Pesce', 'Olio extravergine', 'Aglio', 'Cipolla', 'Passata di pomodoro', 'Prezzemolo', 'Origano', 'Capperi', 'Olive', 'Peperoncino'], array[]::text[], false),
  ('Fettine panate', 'dinner', array['Carne a scelta', 'Filetti di pesce', 'Uova', 'Pangrattato', 'Prezzemolo', 'Olio extravergine'], array[]::text[], false),
  ('Fettine alla scaloppina', 'dinner', array['Carne a scelta', 'Filetti di pesce', 'Farina', 'Olio extravergine', 'Vino bianco', 'Marsala', 'Birra', 'Limone'], array[]::text[], false),
  ('Pesce spada o tonno alla cacciatora', 'dinner', array['Pesce spada', 'Tonno', 'Aglio', 'Rosmarino', 'Olio extravergine', 'Aceto di vino', 'Vino bianco'], array[]::text[], false),
  ('Pesce al forno con patate', 'dinner', array['Pesce', 'Patate', 'Aglio', 'Rosmarino', 'Vino bianco', 'Olio extravergine'], array[]::text[], false),
  ('Pollo alla cacciatora', 'dinner', array['Pollo', 'Aglio', 'Rosmarino', 'Vino', 'Aceto', 'Olio extravergine', 'Passata di pomodoro'], array[]::text[], false),
  ('Insalata di pollo', 'dinner', array['Pollo', 'Lattuga', 'Radicchio', 'Pomodori', 'Limone', 'Olio extravergine'], array[]::text[], false),
  ('Insalata di pollo al limone e basilico', 'dinner', array['Pollo', 'Tacchino', 'Yogurt', 'Basilico', 'Limone', 'Sedano', 'Carote', 'Radicchio', 'Insalata verde'], array[]::text[], false),
  ('Carpaccio di manzo con verdure', 'dinner', array['Manzo', 'Zucchine', 'Funghi', 'Carote', 'Sedano', 'Parmigiano', 'Limone', 'Olio extravergine'], array[]::text[], false),
  ('Frittata alle erbe', 'dinner', array['Uova', 'Crusca', 'Latte', 'Bieta', 'Spinaci', 'Asparagi', 'Broccoli', 'Olio extravergine'], array['vegetariano'], false),
  ('Frittata di spinaci', 'dinner', array['Spinaci', 'Uova', 'Parmigiano', 'Olio extravergine'], array['vegetariano'], false),
  ('Insalata di pesce e melanzane', 'dinner', array['Pesce', 'Melanzane', 'Aglio', 'Prezzemolo', 'Limone', 'Olio extravergine'], array[]::text[], false),
  ('Filetti di pesce al cartoccio', 'dinner', array['Filetti di pesce', 'Limone', 'Maggiorana', 'Funghi', 'Pomodori', 'Olio extravergine'], array[]::text[], false),
  ('Carpaccio di pesce', 'dinner', array['Pesce', 'Finocchi', 'Verdure fresche', 'Limone', 'Olio extravergine'], array[]::text[], false),
  ('Merluzzo alla livornese', 'dinner', array['Merluzzo', 'Aglio', 'Passata di pomodoro', 'Olive nere', 'Olio extravergine'], array[]::text[], false),
  ('Tonno alla piastra con sesamo', 'dinner', array['Tonno', 'Semi di sesamo', 'Limone', 'Olio extravergine'], array[]::text[], false),
  ('Pesce spada alla griglia con pomodorini e olive', 'dinner', array['Pesce spada', 'Pomodorini', 'Aglio', 'Basilico', 'Origano', 'Olive', 'Olio extravergine'], array[]::text[], false),
  ('Merluzzo al forno con patate, pomodorini e olive', 'dinner', array['Merluzzo', 'Patate', 'Pomodorini', 'Olive', 'Aglio', 'Prezzemolo', 'Pangrattato', 'Olio extravergine'], array[]::text[], false),

  ('Riso basmati con pesce e verdure', 'lunch', array['Riso basmati', 'Pesce', 'Pollo', 'Finocchi', 'Carote', 'Curcuma', 'Curry', 'Cipolla rossa', 'Aglio', 'Peperoncino', 'Pinoli', 'Mandorle', 'Limone', 'Ceci'], array[]::text[], false),
  ('Riso Venere con pesce affumicato e avocado', 'lunch', array['Riso Venere', 'Salmone affumicato', 'Pesce affumicato', 'Avocado', 'Finocchi', 'Ravanelli', 'Carote', 'Limone', 'Arance', 'Pepe rosa', 'Menta', 'Basilico', 'Pomodorini'], array[]::text[], false),
  ('Riso tiepido con arrosto e pompelmo', 'lunch', array['Riso', 'Arrosto di maiale', 'Arrosto di vitello', 'Spezzatino di soia', 'Seitan', 'Pesce azzurro', 'Pompelmo rosa', 'Menta', 'Olio extravergine'], array[]::text[], false),
  ('Riso Venere con gamberi, zucchine e pomodorini', 'lunch', array['Riso Venere', 'Gamberi', 'Zucchine', 'Aglio', 'Limone', 'Pomodorini', 'Olio extravergine'], array[]::text[], false),

  ('Caponatina', 'other', array['Patate', 'Melanzane', 'Peperoni', 'Zucchine', 'Aglio', 'Cipolla', 'Capperi', 'Zucchero', 'Vino', 'Olio extravergine'], array['vegetariano', 'contorno'], false),
  ('Padellata primavera', 'other', array['Carciofi', 'Piselli', 'Fave', 'Aglio', 'Prezzemolo', 'Olio extravergine'], array['vegetariano', 'contorno'], false),
  ('Piselli e funghi in padella', 'other', array['Piselli', 'Funghi', 'Aglio', 'Prezzemolo', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Patate all’ortolana', 'other', array['Patate', 'Peperoni', 'Pomodori', 'Lattuga', 'Cetrioli', 'Basilico', 'Olio extravergine'], array['vegetariano', 'contorno'], false),
  ('Patate in insalata', 'other', array['Patate', 'Fagiolini', 'Zucchine', 'Asparagi', 'Cavolfiore', 'Cavoletti di Bruxelles', 'Carote', 'Prezzemolo', 'Aceto', 'Olio extravergine'], array['vegetariano', 'contorno'], false),
  ('Insalata di verdure e patate', 'other', array['Patate', 'Pomodori', 'Fagiolini', 'Aglio', 'Basilico', 'Aceto di vino', 'Aceto di mele', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Melanzane alla marinara', 'other', array['Melanzane', 'Passata di pomodoro', 'Origano', 'Basilico', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Melanzane a funghetto', 'other', array['Melanzane', 'Aglio', 'Basilico', 'Peperoncino', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Pomodori alla maggiorana', 'other', array['Pomodori', 'Aglio', 'Pangrattato', 'Maggiorana', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Verdure grigliate', 'other', array['Radicchio', 'Melanzane', 'Zucchine', 'Pomodori', 'Cipolla', 'Peperoni', 'Passata di pomodoro', 'Basilico', 'Prezzemolo', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Verdure trifolate', 'other', array['Funghi', 'Zucchine', 'Melanzane', 'Carciofi', 'Aglio', 'Cipolla', 'Pomodori', 'Prezzemolo', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Asparagi marinati alla piastra', 'other', array['Asparagi', 'Limone', 'Pepe nero', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Zucchine crude marinate', 'other', array['Zucchine', 'Limone', 'Menta', 'Pepe nero', 'Peperoncino', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Fagiolini all’agro', 'other', array['Fagiolini', 'Aceto balsamico', 'Limone', 'Aglio', 'Menta', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Melanzane al forno con pomodorini', 'other', array['Melanzane', 'Pomodorini', 'Aglio', 'Olio extravergine'], array['vegano', 'contorno'], false),
  ('Zucchine in padella con pomodorini', 'other', array['Zucchine', 'Pomodorini', 'Cipolla', 'Olio extravergine'], array['vegano', 'contorno'], false),

  ('Guacamole classico', 'other', array['Avocado', 'Lime', 'Limone', 'Sale'], array['vegano'], true),
  ('Guacamole al pomodoro', 'other', array['Avocado', 'Pomodori', 'Peperoncino', 'Cipolla', 'Aglio', 'Lime', 'Limone'], array['vegano'], true),
  ('Hummus di ceci', 'other', array['Ceci', 'Olio extravergine', 'Limone', 'Cumino', 'Prezzemolo'], array['vegano'], true),

  ('Burger di lenticchie', 'dinner', array['Lenticchie', 'Salvia', 'Origano', 'Olio extravergine', 'Pangrattato'], array['vegano'], false),
  ('Burger di fagioli rossi', 'dinner', array['Fagioli rossi', 'Borlotti', 'Olio extravergine', 'Prezzemolo', 'Farina di mais', 'Scalogno'], array['vegano'], false),
  ('Burger di lupini', 'dinner', array['Lupini', 'Olio extravergine', 'Semi di finocchio', 'Fiocchi d’avena', 'Pangrattato', 'Cipolla'], array['vegano'], false),
  ('Burger di verdure', 'dinner', array['Patate', 'Carote', 'Zucchine', 'Olio extravergine', 'Rosmarino', 'Pangrattato', 'Curcuma'], array['vegano'], false),
  ('Burger di ceci', 'dinner', array['Ceci', 'Olio extravergine', 'Noce moscata', 'Erba cipollina', 'Prezzemolo', 'Pangrattato', 'Curry'], array['vegano'], false),

  ('Torta di mele senza burro', 'other', array['Mele', 'Uova', 'Farina integrale', 'Farina d’avena', 'Zucchero di canna', 'Miele', 'Olio', 'Latte', 'Limone', 'Lievito per dolci', 'Cannella'], array[]::text[], true),
  ('Torta light al cacao', 'other', array['Farina d’avena', 'Zucchero di canna', 'Miele', 'Latte', 'Cacao amaro', 'Lievito per dolci'], array[]::text[], true),
  ('Plumcake allo yogurt e fiocchi d’avena', 'other', array['Farina', 'Fiocchi d’avena', 'Frumina', 'Uova', 'Zucchero di canna', 'Miele', 'Yogurt bianco', 'Yogurt greco', 'Lievito per dolci'], array[]::text[], true),
  ('Yogomisu', 'other', array['Fette biscottate integrali', 'Yogurt greco', 'Yogurt bianco', 'Miele', 'Anacardi', 'Mandorle', 'Crema alla nocciola', 'Muesli', 'Fiocchi d’avena', 'Fiocchi di farro', 'Caffè'], array[]::text[], true),
  ('Banana bread', 'other', array['Banane', 'Uova', 'Miele', 'Zucchero di canna', 'Latte', 'Bevanda vegetale', 'Farina integrale', 'Cioccolato fondente', 'Lievito per dolci'], array[]::text[], true),
  ('Tortine allo yogurt con mele e mandorle', 'other', array['Farina d’avena', 'Uova', 'Olio extravergine', 'Lievito per dolci', 'Yogurt bianco', 'Mele', 'Miele', 'Mandorle'], array[]::text[], true),
  ('Barrette energetiche con cereali e frutta secca', 'other', array['Fiocchi d’avena', 'Cereali integrali', 'Farina d’avena', 'Noci', 'Mandorle', 'Uvetta', 'Miele', 'Acqua'], array[]::text[], true),
  ('Plumcake all’arancia e cioccolato fondente', 'other', array['Uova', 'Miele', 'Latte', 'Olio extravergine', 'Arance', 'Farina', 'Lievito per dolci', 'Cioccolato fondente'], array[]::text[], true),
  ('Weetamisu', 'other', array['Weetabix', 'Caffè', 'Yogurt greco', 'Miele', 'Cacao amaro'], array[]::text[], true),
  ('Cannoli morbidi con yogurt e cioccolato', 'other', array['Albume', 'Bevanda vegetale', 'Latte', 'Farina integrale', 'Yogurt greco', 'Cioccolato fondente', 'Cacao amaro', 'Miele'], array[]::text[], true),
  ('Gelato biscotto', 'other', array['Biscotti', 'Yogurt greco', 'Cioccolato fondente', 'Granella di nocciole'], array[]::text[], true),
  ('Mousse al cioccolato e albumi', 'other', array['Albume', 'Bevanda vegetale', 'Cioccolato fondente', 'Miele', 'Mandorle', 'Nocciole', 'Anacardi'], array[]::text[], true),
  ('Granola fatta in casa', 'other', array['Fiocchi d’avena', 'Cereali integrali', 'Frutti rossi disidratati', 'Mandorle', 'Nocciole', 'Olio extravergine', 'Acqua', 'Miele'], array[]::text[], true),
  ('Crepes proteiche con albumi', 'other', array['Albume', 'Latte', 'Bevanda vegetale', 'Farina d’avena', 'Farina integrale', 'Miele', 'Marmellata', 'Burro di arachidi'], array[]::text[], true),
  ('Torta al cacao e pere', 'other', array['Uova', 'Miele', 'Albume', 'Latte', 'Olio', 'Cacao amaro', 'Farina integrale', 'Lievito per dolci', 'Pere'], array[]::text[], true),
  ('Gelato fatto in casa con frutta congelata', 'other', array['Banane', 'Frutta a scelta', 'Miele', 'Latte d’avena', 'Yogurt'], array[]::text[], true);

create temporary table maja_recipe_instructions (
  title text primary key,
  instructions text[] not null
) on commit drop;

insert into maja_recipe_instructions (title, instructions) values
  ('Sugo di pomodoro', array['Scalda l’olio con aglio, cipolla, sedano e carota tritati.', 'Aggiungi la passata e cuoci finché il sugo si addensa; completa con basilico o prezzemolo.']),
  ('Pasta alla carrettiera', array['Rosola aglio e acciughe nell’olio, poi aggiungi pomodoro, capperi, olive e origano.', 'Cuoci la pasta, saltala nel sugo e rifinisci con prezzemolo e peperoncino se gradito.']),
  ('Pasta o riso con verdure', array['Taglia la verdura scelta e falla ammorbidire in padella con aglio e olio.', 'Cuoci pasta o riso, uniscili alle verdure e completa con formaggio grattugiato e prezzemolo.']),
  ('Insalata di pasta o riso', array['Cuoci pasta o riso, scolali e raffreddali sotto acqua fredda.', 'Unisci verdure a pezzetti e tonno oppure tofu; condisci con olio ed erbe e servi freddo.']),
  ('Insalata vegetariana di pasta o riso', array['Cuoci pasta o riso e lasciali raffreddare.', 'Aggiungi pomodori, verdure fresche e legumi cotti; condisci e lascia insaporire prima di servire.']),
  ('Tabulè freddo estivo', array['Prepara il cous cous seguendo le indicazioni della confezione e sgranalo con una forchetta.', 'Condiscilo con olio e limone, poi incorpora pomodorini, peperoni e foglie di menta o basilico.']),
  ('Pasta e piselli', array['Fai appassire cipolla o scalogno in padella, aggiungi i piselli e cuocili con un po’ d’acqua.', 'Unisci la pasta e portala a cottura; servi con Parmigiano se gradito.']),
  ('Cous cous con verdure e legumi', array['Fai insaporire aglio, cipolla e peperoncino, poi aggiungi carote, melanzane e zucchine.', 'Quando le verdure sono morbide, unisci pomodorini e ceci; servi con il cous cous preparato a parte.']),
  ('Riso in bianco alle erbe', array['Cuoci il riso in acqua e scolalo quando è tenero.', 'Condiscilo con olio e rosmarino tritato, oppure con prezzemolo o basilico.']),
  ('Riso e fagioli', array['Prepara una base morbida di cipolla, pomodoro, carota e sedano; aggiungi i legumi cotti.', 'Cuoci il riso separatamente, uniscilo ai legumi e termina con erba cipollina e formaggio.']),
  ('Zuppa di verdure italiana', array['Riunisci gli ortaggi tagliati in una pentola con brodo vegetale e cuocili finché sono teneri.', 'Aggiungi, se desideri, pasta, riso o orzo; servi con olio e pane tostato oppure frulla la zuppa.']),
  ('Lenticchie in minestra', array['Fai insaporire cipolla, sedano, carota e aglio con olio, poi aggiungi pomodoro e lenticchie.', 'Copri con brodo e cuoci finché le lenticchie sono morbide; servi con prezzemolo e pane.']),
  ('Legumi in padella', array['Scalda aglio e olio, aggiungi i pomodori e cuocili fino a ottenere un fondo morbido.', 'Unisci i legumi già cotti e lasciali insaporire; completa con erbe e servi con pane o uova.']),
  ('Pasta e ceci', array['Cuoci i ceci con aglio e rosmarino finché diventano morbidi; schiacciane una parte per addensare il fondo.', 'Aggiungi la pasta e cuocila nella minestra, oppure cuocila a parte e poi uniscila; completa con olio e aromi.']),
  ('Pasta e fagioli estiva', array['Cuoci i fagioli con carota e sedano, poi lasciali raffreddare.', 'Cuoci la pasta, raffreddala e mescolala con fagioli, carote a julienne, prezzemolo e olio.']),
  ('Pasta alla Norma', array['Cuoci le melanzane a dadini in padella con aglio, olio e passata di pomodoro.', 'Condisci la pasta appena cotta con il sugo e il basilico; completa con il formaggio scelto.']),
  ('Riso freddo con salmone, zucchine e limone', array['Cuoci le zucchine in padella con olio e poca acqua finché sono tenere.', 'Cuoci il riso, lascialo intiepidire e mescolalo con salmone, zucchine, limone e aromi; servi freddo.']),
  ('Calamarata alla pescatora', array['Pulisci i calamari e tagliali ad anelli; rosolali con aglio e olio.', 'Aggiungi vino, pomodorini e passata, poi cuoci la pasta e completala nel sugo con prezzemolo.']),

  ('Pizzaiola', array['Scalda aglio e cipolla con olio, aggiungi passata, origano e prezzemolo e lascia insaporire.', 'Cuoci carne o pesce nel sugo, girandoli una volta; aggiungi olive e capperi verso fine cottura.']),
  ('Fettine panate', array['Passa carne o pesce nell’uovo sbattuto con prezzemolo, poi ricopri con pangrattato.', 'Disponi le fettine in una teglia oliata e cuocile in forno, girandole per dorarle da entrambi i lati.']),
  ('Fettine alla scaloppina', array['Infarina carne o pesce e rosolali brevemente in padella con olio.', 'Aggiungi vino, birra, Marsala o limone con poca acqua e cuoci finché la salsa vela le fettine.']),
  ('Pesce spada o tonno alla cacciatora', array['Scalda olio, aglio e rosmarino; rosola i bocconcini di pesce su ogni lato.', 'Sfuma con vino o aceto e completa la cottura senza asciugare il fondo.']),
  ('Pesce al forno con patate', array['Distribuisci le patate affettate in una teglia con aglio, rosmarino e olio.', 'Sistema il pesce sopra le patate, aggiungi vino e cuoci in forno finché entrambi sono pronti.']),
  ('Pollo alla cacciatora', array['Condisci il pollo con aglio, rosmarino, vino e aceto e lascialo insaporire al fresco.', 'Rosolalo con olio e passata, aggiungi la marinata e cuoci coperto finché la carne è tenera.']),
  ('Insalata di pollo', array['Cuoci il pollo in acqua, lascialo raffreddare e taglialo a striscioline.', 'Mescolalo con lattuga, radicchio e pomodori; condisci con limone e olio.']),
  ('Insalata di pollo al limone e basilico', array['Cuoci pollo o tacchino e taglialo a bocconcini; prepara una crema mescolando yogurt, basilico e limone.', 'Unisci carne, sedano e carote alla crema e servi con radicchio o insalata verde.']),
  ('Carpaccio di manzo con verdure', array['Usa manzo adatto al consumo crudo e mantienilo refrigerato; affettalo sottilmente.', 'Disponi la carne con le verdure tagliate fini, condisci con limone e olio e aggiungi scaglie di Parmigiano.']),
  ('Frittata alle erbe', array['Sbatti le uova con crusca e latte e versale in una padella appena unta.', 'Distribuisci al centro le verdure già cotte, ripiega la frittata e termina la cottura.']),
  ('Frittata di spinaci', array['Cuoci gli spinaci, strizzali bene e tritali.', 'Mescolali con uova e Parmigiano, poi cuoci il composto in padella girando la frittata quando si rassoda.']),
  ('Insalata di pesce e melanzane', array['Cuoci il pesce in acqua e griglia le melanzane senza aggiungere olio.', 'Sminuzza il pesce e mescolalo con le melanzane, aglio, prezzemolo, olio e limone.']),
  ('Filetti di pesce al cartoccio', array['Sistema il pesce su carta da forno o alluminio e condiscilo con limone, maggiorana e pepe.', 'Aggiungi funghi o pomodoro, chiudi il cartoccio e cuoci in forno finché il filetto è tenero.']),
  ('Carpaccio di pesce', array['Usa pesce idoneo al consumo crudo e già trattato secondo le norme di sicurezza; affettalo finemente.', 'Condiscilo con olio, limone e pepe e servilo su finocchi o altre verdure fresche.']),
  ('Merluzzo alla livornese', array['Fai insaporire aglio e olio con la passata in una padella.', 'Aggiungi il merluzzo e le olive e cuoci a fuoco moderato finché il pesce si sfalda facilmente.']),
  ('Tonno alla piastra con sesamo', array['Spennella il tonno con olio e limone e premi i semi di sesamo sulla superficie.', 'Cuocilo su una piastra ben calda da entrambi i lati e completa con limone.']),
  ('Pesce spada alla griglia con pomodorini e olive', array['Cuoci il pesce spada su una piastra calda.', 'Mescola pomodorini, olive, aglio, basilico e origano con olio e distribuisci il condimento sul pesce.']),
  ('Merluzzo al forno con patate, pomodorini e olive', array['Affetta le patate e disponile in teglia con olio; falle ammorbidire in forno.', 'Aggiungi merluzzo, pomodorini, olive, aglio e prezzemolo e cuoci finché il pesce è pronto.']),

  ('Riso basmati con pesce e verdure', array['Cuoci il riso basmati; in un’altra padella fai appassire cipolla, finocchi e carote.', 'Aggiungi pesce o pollo, insaporisci con curry e curcuma e servi insieme al riso con ceci o frutta secca.']),
  ('Riso Venere con pesce affumicato e avocado', array['Cuoci il riso Venere e condiscilo con olio, succo e scorza degli agrumi.', 'Aggiungi pesce affumicato, avocado e verdure affettate; mescola e servi tiepido o freddo.']),
  ('Riso tiepido con arrosto e pompelmo', array['Cuoci il riso e lascialo intiepidire; taglia arrosto, seitan o pesce già cotto a striscioline.', 'Unisci il pompelmo pelato a vivo, menta e olio, poi mescola delicatamente.']),
  ('Riso Venere con gamberi, zucchine e pomodorini', array['Cuoci il riso Venere e grattugia le zucchine.', 'Salta le zucchine con aglio e olio, aggiungi i gamberi puliti e i pomodorini, poi servi il condimento sul riso con limone.']),

  ('Caponatina', array['Taglia le verdure a pezzi e cuocile lentamente in padella con olio, aglio e cipolla.', 'Verso fine cottura aggiungi capperi, zucchero e vino e lascia insaporire.']),
  ('Padellata primavera', array['Cuoci i carciofi affettati con aglio e olio, aggiungendo poca acqua per mantenerli morbidi.', 'Unisci piselli e fave, completa con prezzemolo e servi tiepido.']),
  ('Piselli e funghi in padella', array['Cuoci i funghi affettati in padella con aglio e olio, coprendoli per farli ammorbidire.', 'Aggiungi i piselli e il prezzemolo e prosegui finché i sapori si amalgamano.']),
  ('Patate all’ortolana', array['Lessa le patate, falle raffreddare e tagliale a dadini.', 'Mescolale con peperoni, pomodori, lattuga o cetrioli e condisci con basilico e olio.']),
  ('Patate in insalata', array['Cuoci le patate e le verdure scelte al vapore, poi lasciale raffreddare e tagliale.', 'Condisci con olio e prezzemolo; aggiungi aceto se gradito.']),
  ('Insalata di verdure e patate', array['Lessa patate e fagiolini, poi tagliali insieme ai pomodori.', 'Condisci con aglio, basilico, olio e aceto a piacere.']),
  ('Melanzane alla marinara', array['Cuoci le melanzane sulla griglia o riscalda quelle già grigliate.', 'Distribuisci sopra passata, origano o basilico e un filo d’olio.']),
  ('Melanzane a funghetto', array['Taglia le melanzane a cubetti e cuocile in padella con aglio e olio.', 'Aggiungi basilico e, se gradito, peperoncino; mescola finché le melanzane sono morbide.']),
  ('Pomodori alla maggiorana', array['Taglia i pomodori a metà e sistemali in padella con la parte tagliata rivolta verso l’alto.', 'Condiscili con aglio, maggiorana e pangrattato, copri e cuoci a fiamma bassa.']),
  ('Verdure grigliate', array['Taglia le verdure a fette o falde e grigliale finché sono tenere e segnate.', 'Condiscile con olio ed erbe; se usi verdure già grigliate, scaldale in forno con passata e basilico.']),
  ('Verdure trifolate', array['Taglia funghi, zucchine, melanzane o carciofi e trasferiscili in una padella con olio e aromi.', 'Cuoci mescolando e aggiungi poca acqua se necessario; completa con prezzemolo.']),
  ('Asparagi marinati alla piastra', array['Condisci gli asparagi con olio, limone e pepe e lasciali insaporire.', 'Cuocili sulla piastra girandoli finché sono teneri e leggermente dorati.']),
  ('Zucchine crude marinate', array['Affetta sottilmente le zucchine e bagnale con succo di limone.', 'Dopo il riposo al fresco, condiscile con olio, menta e pepe o peperoncino.']),
  ('Fagiolini all’agro', array['Lessa i fagiolini puliti e scolali quando sono teneri.', 'Condiscili con olio, aceto o limone, aglio e menta.']),
  ('Melanzane al forno con pomodorini', array['Taglia le melanzane a fette e prepara i pomodorini con aglio e aromi.', 'Disponi tutto in teglia, condisci con olio e cuoci in forno finché le melanzane sono morbide.']),
  ('Zucchine in padella con pomodorini', array['Taglia zucchine e pomodorini e mettili in padella con cipolla e olio.', 'Aggiungi un po’ d’acqua e cuoci coperto, mescolando finché le verdure sono tenere.']),

  ('Guacamole classico', array['Schiaccia la polpa di avocado con una forchetta fino a renderla cremosa.', 'Aggiungi lime o limone e sale, mescola e servi subito.']),
  ('Guacamole al pomodoro', array['Schiaccia l’avocado e incorpora pomodoro e cipolla tritati.', 'Aggiungi aglio, peperoncino e succo di lime o limone a piacere e mescola.']),
  ('Hummus di ceci', array['Frulla i ceci con olio, succo di limone e cumino.', 'Aggiungi poca acqua fino a ottenere una crema liscia e completa con prezzemolo.']),

  ('Burger di lenticchie', array['Cuoci le lenticchie con la salvia, scolale e schiacciale o frullale con olio e origano.', 'Incorpora pangrattato fino a ottenere un composto modellabile, forma i burger e cuocili in forno.']),
  ('Burger di fagioli rossi', array['Schiaccia i fagioli e mescolali con prezzemolo e scalogno rosolato.', 'Aggiungi farina di mais fino a compattare, forma i burger e cuocili in padella o al forno.']),
  ('Burger di lupini', array['Sbuccia i lupini e frullali con olio fino a ottenere una base densa.', 'Unisci cipolla rosolata, fiocchi d’avena, semi di finocchio e pangrattato; forma i burger e cuocili.']),
  ('Burger di verdure', array['Cuoci patate, carote e zucchine finché sono morbide, poi schiacciale insieme.', 'Aggiungi rosmarino, curcuma e pangrattato per compattare; forma i burger e cuocili in forno.']),
  ('Burger di ceci', array['Schiaccia i ceci con olio e mescolali con prezzemolo, erba cipollina e spezie.', 'Aggiungi pangrattato per rendere il composto lavorabile, forma i burger e cuocili in padella o al forno.']),

  ('Torta di mele senza burro', array['Taglia le mele a fettine e profumale con limone e cannella.', 'Mescola uova, dolcificante, olio e latte; incorpora farina e lievito, poi le mele e cuoci in uno stampo.']),
  ('Torta light al cacao', array['Mescola farina, dolcificante, cacao e lievito.', 'Versa il latte a filo mescolando fino a eliminare i grumi, trasferisci nello stampo e cuoci in forno.']),
  ('Plumcake allo yogurt e fiocchi d’avena', array['Monta uova, zucchero e miele fino a renderli chiari; incorpora lo yogurt.', 'Aggiungi farina, avena, frumina e lievito, trasferisci nello stampo e cuoci in forno.']),
  ('Yogomisu', array['Mescola yogurt, miele e frutta secca tritata per preparare la crema.', 'Alterna fette biscottate appena inzuppate e crema; lascia rassodare al fresco e completa con muesli e crema alla nocciola.']),
  ('Banana bread', array['Schiaccia le banane e mescolale con uova, latte e miele o zucchero.', 'Incorpora farina e lievito, aggiungi il cioccolato e cuoci nello stampo da plumcake.']),
  ('Tortine allo yogurt con mele e mandorle', array['Lavora uovo e miele, incorpora olio e yogurt e poi farina e lievito.', 'Sistema le mele negli stampini, versa l’impasto, aggiungi mandorle e cuoci in forno.']),
  ('Barrette energetiche con cereali e frutta secca', array['Mescola fiocchi, cereali, farina, frutta secca e uvetta.', 'Sciogli il miele in acqua calda, incorporalo, compatta il composto in teglia e cuoci; raffredda prima di tagliare.']),
  ('Plumcake all’arancia e cioccolato fondente', array['Monta uova e miele, poi incorpora latte, olio, succo e scorza d’arancia.', 'Aggiungi farina e lievito, versa nello stampo e cuoci; completa con cioccolato verso fine cottura.']),
  ('Weetamisu', array['Prepara il caffè e mescola lo yogurt con il miele.', 'Alterna strati di Weetabix inumidito e yogurt, completa con cacao e lascia riposare al fresco.']),
  ('Cannoli morbidi con yogurt e cioccolato', array['Mescola albume, latte e farina fino a ottenere una pastella liscia; cuocila in padella formando crepes sottili.', 'Farcisci le crepes con yogurt e cioccolato tritato, arrotolale e completa con cacao.']),
  ('Gelato biscotto', array['Mescola lo yogurt con il cioccolato tritato e spalma la crema tra i biscotti.', 'Metti in freezer finché il ripieno si rassoda e completa i bordi con granella di nocciole.']),
  ('Mousse al cioccolato e albumi', array['Riunisci albumi, bevanda vegetale, cioccolato e miele in un pentolino.', 'Scalda mescolando finché la crema si addensa, falla raffreddare e lasciala riposare in frigorifero.']),
  ('Granola fatta in casa', array['Trita mandorle e nocciole e mescolale con avena, cereali e frutti rossi.', 'Unisci acqua, miele e olio scaldati, stendi il composto in teglia e cuocilo mescolando; fai raffreddare.']),
  ('Crepes proteiche con albumi', array['Mescola albumi, latte e farina fino a ottenere una pastella uniforme.', 'Cuoci crepes sottili in una padella appena unta e farciscile con miele, marmellata o burro di arachidi.']),
  ('Torta al cacao e pere', array['Monta uova e miele, incorpora gli albumi e poi latte e olio.', 'Aggiungi farina, cacao e lievito, versa nello stampo e inserisci le pere affettate prima di cuocere.']),
  ('Gelato fatto in casa con frutta congelata', array['Taglia e congela banana e frutta scelta, poi frullale fino a ottenere una consistenza cremosa.', 'Dolcifica a piacere; per una variante più morbida frulla la frutta con yogurt o bevanda d’avena.']);

do $$
declare
  target_household_id uuid;
  target_user_id uuid;
  inserted_recipe_count integer;
begin
  select household_id::uuid into target_household_id
  from maja_import_settings
  limit 1;

  if target_household_id is null then
    raise exception 'L’ID della casa è obbligatorio.';
  end if;

  select user_id into target_user_id
  from public.household_members
  where household_id = target_household_id
    and role = 'owner';

  if target_user_id is null then
    raise exception 'La casa non esiste o non ha un proprietario associato.';
  end if;

  if exists (
    select 1
    from maja_recipe_seed seed
    left join maja_recipe_instructions procedure_steps on procedure_steps.title = seed.title
    where procedure_steps.title is null
  ) then
    raise exception 'Manca la procedura per una o più ricette.';
  end if;

  insert into public.ingredients (household_id, canonical_name, name, category)
  select
    target_household_id,
    lower(btrim(ingredient_name)),
    ingredient_name,
    case
      when lower(ingredient_name) ~ '(pomodor|zucchin|spinac|aglio|cipoll|sedano|carot|melanzan|peperon|asparag|carciof|fung|rucola|lattuga|scarola|radicchio|ravanell|cetriol|finocch|patat|fagiolin|fave|pisell|prezzemol|basilico|menta|rosmarino|broccol|cavolf|cavolett|limon|aranc|pompelmo|avocado|banan|mela|pera|pesca|frutt|uva|scalogno)' then 'fruit-vegetables'
      when lower(ingredient_name) ~ '(latte|yogurt|formaggio|parmigiano|pecorino|ricotta|uova|albume|burro)' then 'dairy'
      when lower(ingredient_name) ~ '(pesce|tonno|salmone|pollo|tacchin|manzo|vitello|carne|maiale|calamar|gamber|acciugh|vongol)' then 'meat-fish'
      when lower(ingredient_name) ~ '(pane|pangrattato|biscott|fette biscottate|weetabix)' then 'bakery'
      else 'pantry'
    end
  from (
    select distinct btrim(ingredient_name) as ingredient_name
    from maja_recipe_seed
    cross join lateral unnest(ingredients) as imported_ingredient(ingredient_name)
  ) as new_ingredients
  where not exists (
    select 1
    from public.ingredients existing
    where existing.household_id = target_household_id
      and lower(btrim(existing.name)) = lower(new_ingredients.ingredient_name)
  )
  on conflict (household_id, canonical_name) do nothing;

  insert into public.recipes (
    household_id,
    title,
    description,
    servings,
    prep_minutes,
    category,
    tags,
    instructions,
    excluded_from_plan,
    created_by
  )
  select
    target_household_id,
    seed.title,
    '',
    2,
    0,
    seed.category,
    seed.tags,
    procedure_steps.instructions,
    seed.excluded_from_plan,
    target_user_id
  from maja_recipe_seed seed
  join maja_recipe_instructions procedure_steps on procedure_steps.title = seed.title
  where not exists (
    select 1
    from public.recipes existing
    where existing.household_id = target_household_id
      and lower(existing.title) = lower(seed.title)
  );
  get diagnostics inserted_recipe_count = row_count;

  update public.recipes existing
  set excluded_from_plan = false,
      tags = case
        when 'contorno' = any(existing.tags) then existing.tags
        else array_append(existing.tags, 'contorno')
      end
  from maja_recipe_seed seed
  where seed.tags @> array['contorno']::text[]
    and existing.household_id = target_household_id
    and lower(existing.title) = lower(seed.title);

  update public.recipes existing
  set instructions = procedure_steps.instructions,
      description = case
        when existing.description = 'Ricetta dal ricettario; consulta il PDF per il procedimento.' then ''
        else existing.description
      end
  from maja_recipe_seed seed
  join maja_recipe_instructions procedure_steps on procedure_steps.title = seed.title
  where existing.household_id = target_household_id
    and lower(existing.title) = lower(seed.title)
    and cardinality(existing.instructions) = 0;

  insert into public.recipe_ingredients (household_id, recipe_id, ingredient_id)
  select target_household_id, recipe.id, ingredient.id
  from maja_recipe_seed seed
  cross join lateral unnest(seed.ingredients) as imported_ingredient(ingredient_name)
  join public.recipes recipe
    on recipe.household_id = target_household_id
   and lower(recipe.title) = lower(seed.title)
  join public.ingredients ingredient
    on ingredient.household_id = target_household_id
   and lower(btrim(ingredient.name)) = lower(btrim(ingredient_name))
  on conflict (recipe_id, ingredient_id) do nothing;

  raise notice 'Import completato: % nuove ricette.', inserted_recipe_count;
end;
$$;

commit;
