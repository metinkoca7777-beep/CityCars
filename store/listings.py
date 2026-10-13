"""Google Play store listing texts for every language the game supports.

Run `python3 store/listings.py` to check Play's length limits and regenerate
store/listings/<locale>.md (one copy-paste file per language).
"""
import os

LIMITS = {'title': 30, 'short': 80, 'full': 4000, 'whatsnew': 500}

L = {}

L['en-US'] = dict(
    lang='English (United States)',
    title='CityCars: World Tour Driving',
    short='Drive a toy car through 17 famous cities, discover landmarks & blow things up!',
    full='''Hop into your toy car and road-trip the world's most famous cities! 🚗🌍

CityCars: World Tour is a fun, free-roam driving game. Cruise through Istanbul, Paris, London, New York, Tokyo, Cairo, Agra and more. Every city is packed with its real landmarks. Find them all, learn a fun fact about each one and earn coins to unlock the next destination.

🗺️ 17 CITIES, 50+ LANDMARKS
• Istanbul: Hagia Sophia, the Blue Mosque, Galata Tower and Maiden's Tower
• Cappadocia: fairy chimneys, Göreme cave houses, Uçhisar Castle and hot-air balloons
• Cairo: the Great Pyramid of Giza, the Sphinx and the Muhammad Ali Mosque
• Agra: the Taj Mahal and the Red Fort
• Paris: the Eiffel Tower, Arc de Triomphe, the Louvre and Notre-Dame
• London: Big Ben, the London Eye and Tower Bridge
• New York: the Statue of Liberty, the Empire State Building and neon Times Square
• Plus Rome, Athens, Tokyo, Dubai, Rio, Sydney, Barcelona, San Francisco, Berlin and Amsterdam!

🏛️ REALISTIC LANDMARKS
Detailed 3D models, many scanned from real photos, stand in bright daylight cities under a real sky. Drive right up to the Taj Mahal, circle the pyramids or race across Tower Bridge.

💥 JUMPS, CRASHES & EXPLOSIONS
• Launch off stunt ramps and fly over the streets
• Hit explosive barrels and set off chain reactions
• Knock down bowling pins and crate towers
• Nitro boosts, drifting, skid marks and smoke

🏁 TOUR RACES
Race through a checkpoint at every landmark and chase a gold medal in each city.

🚙 9 CARS TO COLLECT
Mini, City Taxi, Bubble, Retro 70, Safari Jeep, Police, Ice Cream Van, Rocket GT and the Neon Hyper.

🎵 A SOUNDTRACK FOR EVERY CITY
Saz in Istanbul, accordion in Paris, koto in Tokyo, samba in Rio, techno in Berlin and more, plus punchy engine, tyre and explosion sounds.

⭐ ALWAYS SOMETHING TO DO
• Daily rewards with streak bonuses
• 3 missions (stars) in every city
• Coins hidden along the streets and over every jump
• Easy touch controls, plus gamepad and keyboard support

Plays offline and is fun for all ages.

Buckle up — your world tour starts now!''',
    whatsnew='''First release of CityCars: World Tour!
• 17 cities and 50+ famous landmarks, many with real 3D scans
• Stunt ramps, explosive barrels and tour races
• 9 cars to unlock, daily rewards and missions
• Music for every city, in 6 languages''',
)

L['tr-TR'] = dict(
    lang='Türkçe',
    title='CityCars: Dünya Turu Araba',
    short='17 ünlü şehirde oyuncak arabanla sür, turistik yerleri keşfet, her şeyi patlat!',
    full='''Oyuncak arabana atla ve dünyanın en ünlü şehirlerini gez! 🚗🌍

CityCars: Dünya Turu, eğlenceli bir serbest sürüş oyunu. İstanbul, Paris, Londra, New York, Tokyo, Kahire, Agra ve daha fazlasında dolaş. Her şehir gerçek turistik yerleriyle dolu. Hepsini bul, her biri hakkında ilginç bir bilgi öğren ve bir sonraki şehrin kilidini açmak için altın kazan.

🗺️ 17 ŞEHİR, 50+ TURİSTİK YER
• İstanbul: Ayasofya, Sultanahmet Camii, Galata Kulesi ve Kız Kulesi
• Kapadokya: peri bacaları, Göreme kaya evleri, Uçhisar Kalesi ve sıcak hava balonları
• Kahire: Gize Piramidi, Sfenks ve Muhammed Ali Camii
• Agra: Tac Mahal ve Kızıl Kale
• Paris: Eyfel Kulesi, Zafer Takı, Louvre ve Notre-Dame
• Londra: Big Ben, London Eye ve Tower Köprüsü
• New York: Özgürlük Heykeli, Empire State Binası ve neon ışıklı Times Meydanı
• Ayrıca Roma, Atina, Tokyo, Dubai, Rio, Sidney, Barselona, San Francisco, Berlin ve Amsterdam!

🏛️ GERÇEKÇİ TURİSTİK YERLER
Birçoğu gerçek fotoğraflardan taranmış ayrıntılı 3D modeller, gerçek gökyüzü altında aydınlık şehirlerde. Tac Mahal'in önüne kadar sür, piramitlerin etrafında dön ya da Tower Köprüsü'nden hızla geç.

💥 ATLAMALAR, ÇARPIŞMALAR VE PATLAMALAR
• Rampalardan uç, sokakların üzerinden süzül
• Patlayan varillere çarp, zincirleme patlamalar başlat
• Bowling lobutlarını ve kutu kulelerini dağıt
• Nitro, drift, lastik izi ve duman

🏁 TUR YARIŞLARI
Her turistik yerdeki kontrol noktasından geç, her şehirde altın madalya için yarış.

🚙 TOPLANACAK 9 ARABA
Mini, Şehir Taksisi, Balon, Retro 70, Safari Cip, Polis, Dondurma Arabası, Roket GT ve Neon Hiper.

🎵 HER ŞEHRE ÖZEL MÜZİK
İstanbul'da saz, Paris'te akordeon, Tokyo'da koto, Rio'da samba, Berlin'de techno ve daha fazlası; güçlü motor, lastik ve patlama sesleriyle.

⭐ HER ZAMAN YAPACAK BİR ŞEY
• Seri bonuslu günlük ödüller
• Her şehirde 3 görev (yıldız)
• Sokaklara ve her rampanın üzerine saklanmış altınlar
• Kolay dokunmatik kontroller, gamepad ve klavye desteği

İnternetsiz oynanır, her yaştan oyuncu için eğlencelidir.

Kemerlerini bağla, dünya turun başlıyor!''',
    whatsnew='''CityCars: Dünya Turu'nun ilk sürümü!
• 17 şehir ve 50+ ünlü turistik yer, birçoğu gerçek 3D taramalarla
• Rampalar, patlayan variller ve tur yarışları
• Açılacak 9 araba, günlük ödüller ve görevler
• Her şehre özel müzik, 6 dil''',
)

L['es-ES'] = dict(
    lang='Español (España) — copiar también a es-419',
    title='CityCars: Tour Mundial en Auto',
    short='Conduce un coche de juguete por 17 ciudades famosas, descubre monumentos y más',
    full='''¡Sube a tu coche de juguete y recorre las ciudades más famosas del mundo! 🚗🌍

CityCars: World Tour es un divertido juego de conducción libre. Recorre Estambul, París, Londres, Nueva York, Tokio, El Cairo, Agra y muchas más. Cada ciudad está llena de sus monumentos reales. Encuéntralos todos, aprende un dato curioso de cada uno y gana monedas para desbloquear el siguiente destino.

🗺️ 17 CIUDADES, MÁS DE 50 MONUMENTOS
• Estambul: Santa Sofía, la Mezquita Azul, la Torre de Gálata y la Torre de la Doncella
• Capadocia: chimeneas de hadas, casas cueva de Göreme, el castillo de Uçhisar y globos aerostáticos
• El Cairo: la Gran Pirámide de Guiza, la Esfinge y la Mezquita de Muhammad Ali
• Agra: el Taj Mahal y el Fuerte Rojo
• París: la Torre Eiffel, el Arco del Triunfo, el Louvre y Notre-Dame
• Londres: el Big Ben, el London Eye y el Tower Bridge
• Nueva York: la Estatua de la Libertad, el Empire State y el neón de Times Square
• ¡Y además Roma, Atenas, Tokio, Dubái, Río, Sídney, Barcelona, San Francisco, Berlín y Ámsterdam!

🏛️ MONUMENTOS REALISTAS
Modelos 3D detallados, muchos escaneados de fotos reales, en ciudades luminosas bajo un cielo real. Llega hasta el Taj Mahal, rodea las pirámides o cruza a toda velocidad el Tower Bridge.

💥 SALTOS, CHOQUES Y EXPLOSIONES
• Salta desde rampas y vuela sobre las calles
• Choca contra barriles explosivos y provoca reacciones en cadena
• Derriba bolos y torres de cajas
• Nitro, derrapes, marcas de neumáticos y humo

🏁 CARRERAS DE TOUR
Pasa por un punto de control en cada monumento y consigue la medalla de oro en cada ciudad.

🚙 9 COCHES PARA COLECCIONAR
Mini, Taxi, Burbuja, Retro 70, Jeep Safari, Policía, Furgoneta de Helados, Rocket GT y el Neon Hyper.

🎵 MÚSICA PARA CADA CIUDAD
Saz en Estambul, acordeón en París, koto en Tokio, samba en Río, techno en Berlín y más, con potentes sonidos de motor, neumáticos y explosiones.

⭐ SIEMPRE HAY ALGO QUE HACER
• Recompensas diarias con bonificación por racha
• 3 misiones (estrellas) en cada ciudad
• Monedas escondidas por las calles y sobre cada salto
• Controles táctiles sencillos, con soporte para mando y teclado

Se juega sin conexión y es divertido para todas las edades.

¡Abróchate el cinturón: tu vuelta al mundo empieza ya!''',
    whatsnew='''¡Primera versión de CityCars: World Tour!
• 17 ciudades y más de 50 monumentos, muchos con escaneos 3D reales
• Rampas, barriles explosivos y carreras de tour
• 9 coches para desbloquear, recompensas diarias y misiones
• Música para cada ciudad, en 6 idiomas''',
)

L['de-DE'] = dict(
    lang='Deutsch',
    title='CityCars: Weltreise im Auto',
    short='Fahr mit dem Spielzeugauto durch 17 Weltstädte, entdecke Sehenswürdigkeiten!',
    full='''Steig in dein Spielzeugauto und erkunde die berühmtesten Städte der Welt! 🚗🌍

CityCars: World Tour ist ein lustiges Open-World-Fahrspiel. Cruise durch Istanbul, Paris, London, New York, Tokio, Kairo, Agra und viele mehr. Jede Stadt steckt voller echter Sehenswürdigkeiten. Finde sie alle, lerne zu jeder einen spannenden Fakt und verdiene Münzen, um das nächste Ziel freizuschalten.

🗺️ 17 STÄDTE, ÜBER 50 SEHENSWÜRDIGKEITEN
• Istanbul: Hagia Sophia, die Blaue Moschee, der Galataturm und der Leanderturm
• Kappadokien: Feenkamine, die Höhlenhäuser von Göreme, die Burg Uçhisar und Heißluftballons
• Kairo: die Cheops-Pyramide von Gizeh, die Sphinx und die Muhammad-Ali-Moschee
• Agra: das Taj Mahal und das Rote Fort
• Paris: der Eiffelturm, der Arc de Triomphe, der Louvre und Notre-Dame
• London: Big Ben, das London Eye und die Tower Bridge
• New York: die Freiheitsstatue, das Empire State Building und der Neon-Times-Square
• Dazu Rom, Athen, Tokio, Dubai, Rio, Sydney, Barcelona, San Francisco, Berlin und Amsterdam!

🏛️ REALISTISCHE SEHENSWÜRDIGKEITEN
Detaillierte 3D-Modelle, viele aus echten Fotos gescannt, in hellen Städten unter einem echten Himmel. Fahr bis vor das Taj Mahal, umrunde die Pyramiden oder rase über die Tower Bridge.

💥 SPRÜNGE, CRASHS UND EXPLOSIONEN
• Spring über Stuntrampen und flieg über die Straßen
• Triff explosive Fässer und löse Kettenreaktionen aus
• Wirf Bowlingkegel und Kistentürme um
• Nitro, Drift, Reifenspuren und Rauch

🏁 TOUR-RENNEN
Fahr durch einen Checkpoint an jeder Sehenswürdigkeit und hol dir in jeder Stadt Gold.

🚙 9 AUTOS ZUM SAMMELN
Mini, Stadttaxi, Bubble, Retro 70, Safari-Jeep, Polizei, Eiswagen, Rocket GT und der Neon Hyper.

🎵 EIGENE MUSIK FÜR JEDE STADT
Saz in Istanbul, Akkordeon in Paris, Koto in Tokio, Samba in Rio, Techno in Berlin und mehr – dazu kräftige Motor-, Reifen- und Explosionsgeräusche.

⭐ IMMER ETWAS ZU TUN
• Tägliche Belohnungen mit Serienbonus
• 3 Missionen (Sterne) in jeder Stadt
• Münzen in den Straßen und über jeder Rampe
• Einfache Touch-Steuerung, dazu Gamepad- und Tastaturunterstützung

Offline spielbar und Spaß für jedes Alter.

Anschnallen – deine Weltreise beginnt jetzt!''',
    whatsnew='''Erste Version von CityCars: World Tour!
• 17 Städte und über 50 Sehenswürdigkeiten, viele als echte 3D-Scans
• Stuntrampen, explosive Fässer und Tour-Rennen
• 9 Autos zum Freischalten, tägliche Belohnungen und Missionen
• Musik für jede Stadt, in 6 Sprachen''',
)

L['fr-FR'] = dict(
    lang='Français',
    title='CityCars: Tour du Monde Auto',
    short='Roule en petite voiture dans 17 villes célèbres et découvre leurs monuments !',
    full='''Monte dans ta petite voiture et pars à la découverte des villes les plus célèbres du monde ! 🚗🌍

CityCars: World Tour est un jeu de conduite en monde ouvert plein de fun. Parcours Istanbul, Paris, Londres, New York, Tokyo, Le Caire, Agra et bien d'autres. Chaque ville regorge de ses vrais monuments. Trouve-les tous, découvre une anecdote sur chacun et gagne des pièces pour débloquer la destination suivante.

🗺️ 17 VILLES, PLUS DE 50 MONUMENTS
• Istanbul : Sainte-Sophie, la Mosquée bleue, la tour de Galata et la tour de Léandre
• Cappadoce : cheminées de fées, maisons troglodytes de Göreme, château d'Uçhisar et montgolfières
• Le Caire : la Grande Pyramide de Gizeh, le Sphinx et la mosquée de Méhémet Ali
• Agra : le Taj Mahal et le Fort rouge
• Paris : la tour Eiffel, l'Arc de Triomphe, le Louvre et Notre-Dame
• Londres : Big Ben, le London Eye et le Tower Bridge
• New York : la statue de la Liberté, l'Empire State Building et les néons de Times Square
• Et aussi Rome, Athènes, Tokyo, Dubaï, Rio, Sydney, Barcelone, San Francisco, Berlin et Amsterdam !

🏛️ DES MONUMENTS RÉALISTES
Des modèles 3D détaillés, dont beaucoup sont scannés à partir de vraies photos, dans des villes lumineuses sous un vrai ciel. Approche-toi du Taj Mahal, fais le tour des pyramides ou traverse le Tower Bridge à toute vitesse.

💥 SAUTS, CRASHS ET EXPLOSIONS
• Décolle des tremplins et vole au-dessus des rues
• Percute des barils explosifs et déclenche des réactions en chaîne
• Renverse des quilles de bowling et des tours de caisses
• Nitro, drift, traces de pneus et fumée

🏁 COURSES DU TOUR
Passe par un point de contrôle à chaque monument et décroche la médaille d'or dans chaque ville.

🚙 9 VOITURES À COLLECTIONNER
Mini, Taxi, Bulle, Rétro 70, Jeep Safari, Police, Camion de glaces, Rocket GT et la Neon Hyper.

🎵 UNE MUSIQUE POUR CHAQUE VILLE
Saz à Istanbul, accordéon à Paris, koto à Tokyo, samba à Rio, techno à Berlin et plus encore, avec des sons de moteur, de pneus et d'explosions percutants.

⭐ TOUJOURS QUELQUE CHOSE À FAIRE
• Récompenses quotidiennes avec bonus de série
• 3 missions (étoiles) dans chaque ville
• Des pièces cachées dans les rues et au-dessus de chaque tremplin
• Commandes tactiles simples, compatibles manette et clavier

Jouable hors ligne et amusant pour tous les âges.

Attache ta ceinture, ton tour du monde commence maintenant !''',
    whatsnew='''Première version de CityCars: World Tour !
• 17 villes et plus de 50 monuments, dont beaucoup en vrais scans 3D
• Tremplins, barils explosifs et courses du tour
• 9 voitures à débloquer, récompenses quotidiennes et missions
• Une musique pour chaque ville, en 6 langues''',
)

L['pt-BR'] = dict(
    lang='Português (Brasil) — copiar também a pt-PT',
    title='CityCars: Volta ao Mundo',
    short='Dirija um carrinho por 17 cidades famosas, descubra pontos turísticos e mais!',
    full='''Entre no seu carrinho de brinquedo e viaje pelas cidades mais famosas do mundo! 🚗🌍

CityCars: World Tour é um divertido jogo de direção em mundo aberto. Passeie por Istambul, Paris, Londres, Nova York, Tóquio, Cairo, Agra e muito mais. Cada cidade está cheia de seus pontos turísticos reais. Encontre todos, aprenda uma curiosidade sobre cada um e ganhe moedas para desbloquear o próximo destino.

🗺️ 17 CIDADES, MAIS DE 50 PONTOS TURÍSTICOS
• Istambul: Santa Sofia, a Mesquita Azul, a Torre de Gálata e a Torre da Donzela
• Capadócia: chaminés de fada, casas-caverna de Göreme, o Castelo de Uçhisar e balões de ar quente
• Cairo: a Grande Pirâmide de Gizé, a Esfinge e a Mesquita de Muhammad Ali
• Agra: o Taj Mahal e o Forte Vermelho
• Paris: a Torre Eiffel, o Arco do Triunfo, o Louvre e Notre-Dame
• Londres: o Big Ben, a London Eye e a Tower Bridge
• Nova York: a Estátua da Liberdade, o Empire State e o neon da Times Square
• E ainda Roma, Atenas, Tóquio, Dubai, Rio, Sydney, Barcelona, São Francisco, Berlim e Amsterdã!

🏛️ PONTOS TURÍSTICOS REALISTAS
Modelos 3D detalhados, muitos escaneados de fotos reais, em cidades iluminadas sob um céu de verdade. Chegue até o Taj Mahal, contorne as pirâmides ou atravesse a Tower Bridge a toda velocidade.

💥 SALTOS, BATIDAS E EXPLOSÕES
• Salte de rampas e voe sobre as ruas
• Bata em barris explosivos e cause reações em cadeia
• Derrube pinos de boliche e torres de caixas
• Nitro, drift, marcas de pneu e fumaça

🏁 CORRIDAS DO TOUR
Passe por um checkpoint em cada ponto turístico e conquiste a medalha de ouro em cada cidade.

🚙 9 CARROS PARA COLECIONAR
Mini, Táxi, Bolha, Retrô 70, Jipe Safári, Polícia, Van de Sorvete, Rocket GT e o Neon Hyper.

🎵 UMA TRILHA PARA CADA CIDADE
Saz em Istambul, acordeão em Paris, koto em Tóquio, samba no Rio, techno em Berlim e mais, com sons fortes de motor, pneus e explosões.

⭐ SEMPRE TEM ALGO PARA FAZER
• Recompensas diárias com bônus de sequência
• 3 missões (estrelas) em cada cidade
• Moedas escondidas pelas ruas e sobre cada rampa
• Controles de toque simples, com suporte a controle e teclado

Funciona offline e é divertido para todas as idades.

Aperte o cinto: sua volta ao mundo começa agora!''',
    whatsnew='''Primeira versão de CityCars: World Tour!
• 17 cidades e mais de 50 pontos turísticos, muitos com escaneamentos 3D reais
• Rampas, barris explosivos e corridas do tour
• 9 carros para desbloquear, recompensas diárias e missões
• Música para cada cidade, em 6 idiomas''',
)


def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'listings')
    os.makedirs(out, exist_ok=True)
    ok = True
    for loc, d in L.items():
        for k, lim in LIMITS.items():
            n = len(d[k])
            if n > lim:
                ok = False
                print(f'TOO LONG {loc} {k}: {n} > {lim}')
        md = f"""# Google Play — {d['lang']} ({loc})

Play Console → Grow users → Store presence → Main store listing → Manage translations → {loc}

## App name ({len(d['title'])}/30)
```
{d['title']}
```

## Short description ({len(d['short'])}/80)
```
{d['short']}
```

## Full description ({len(d['full'])}/4000)
```
{d['full']}
```

## Release notes — {loc} ({len(d['whatsnew'])}/500)
```
<{loc}>
{d['whatsnew']}
</{loc}>
```
"""
        with open(os.path.join(out, f'{loc}.md'), 'w') as f:
            f.write(md)
        print(loc, 'title', len(d['title']), 'short', len(d['short']), 'full', len(d['full']), 'notes', len(d['whatsnew']))
    # All release notes in one block (Play accepts this format in the release form).
    with open(os.path.join(out, 'release-notes-all.txt'), 'w') as f:
        for loc, d in L.items():
            f.write(f'<{loc}>\n{d["whatsnew"]}\n</{loc}>\n')
    return ok


if __name__ == '__main__':
    raise SystemExit(0 if main() else 1)
