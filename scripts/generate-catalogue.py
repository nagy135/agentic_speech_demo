"""Rebuild the demo catalogue and its original, local SVG illustrations."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# name | family | illustration | learning curve | practice volume | portability | genres | description
ROWS = '''Acoustic Guitar|Strings|guitar|Moderate|Medium|Portable|Folk,Pop,Country|Warm strummed chords and fingerpicked melodies. A versatile companion for singing and songwriting.
Classical Guitar|Strings|guitar|Moderate|Low|Portable|Classical,Latin,Folk|Gentle nylon strings and a rounded tone, ideal for fingerstyle playing and expressive solo pieces.
Electric Guitar|Strings|electric|Moderate|Headphones possible|Portable|Rock,Blues,Jazz|Shape your own sound, from clean melodies to bold riffs. An amplifier or headphone setup is needed.
Bass Guitar|Strings|electric|Moderate|Headphones possible|Portable|Funk,Rock,Jazz|Build the groove with deep, rhythmic bass lines. Great for players who love supporting a band.
Soprano Ukulele|Strings|guitar|Gentle|Low|Very portable|Pop,Folk,Hawaiian|A small four-string instrument with a bright voice and approachable first chords.
Tenor Ukulele|Strings|guitar|Gentle|Low|Very portable|Pop,Folk,Fingerstyle|A little more room for your fingers and a fuller sound than a soprano ukulele.
Violin|Strings|violin|Steep|Medium|Portable|Classical,Folk,Film|A soaring, expressive voice for melodies. Bow control and accurate pitch reward regular practice.
Viola|Strings|violin|Steep|Medium|Portable|Classical,Chamber,Folk|A mellow middle voice with rich lower tones for ensemble players and lyrical soloists.
Cello|Strings|violin|Steep|Medium|Bulky|Classical,Film,Chamber|Deep, singing tones played while seated. A rewarding choice for patient melody lovers.
Double Bass|Strings|violin|Steep|Medium|Bulky|Jazz,Classical,Bluegrass|A resonant low voice that anchors an ensemble, played with a bow or plucked fingers.
Mandolin|Strings|mandolin|Moderate|Medium|Very portable|Bluegrass,Folk,Classical|Crisp paired strings bring sparkling melodies and rhythmic chops to acoustic music.
Banjo|Strings|banjo|Moderate|Loud|Portable|Bluegrass,Folk,Country|A lively, percussive twang for rolling fingerpicking and traditional dance tunes.
Lever Harp|Strings|harp|Moderate|Low|Bulky|Celtic,Classical,Ambient|Flowing, bell-like strings for peaceful melodies and harmonies. Larger models need space.
Lap Steel Guitar|Strings|electric|Moderate|Headphones possible|Portable|Country,Blues,Hawaiian|Slide a steel bar across the strings for smooth, singing notes while playing seated.
Dulcimer|Strings|mandolin|Gentle|Low|Portable|Folk,Traditional|A lap-held mountain dulcimer with a gentle drone and an approachable melody layout.
Oud|Strings|mandolin|Steep|Medium|Portable|Arabic,Turkish,Traditional|A fretless, rounded lute for intricate melodies and expressive pitch inflections.
Sitar|Strings|banjo|Steep|Medium|Bulky|Indian classical,Fusion|Resonant sympathetic strings and bending notes create a distinctive, shimmering sound.
Erhu|Strings|violin|Steep|Medium|Portable|Chinese traditional,Film|Two bowed strings with a vocal quality. Sensitive bowing and pitch control shape each phrase.
Digital Piano|Keys|keyboard|Moderate|Headphones possible|Needs a stand|Classical,Pop,Jazz|Weighted keys and headphone practice make this a flexible way to learn piano at home.
Acoustic Piano|Keys|piano|Moderate|Loud|Stationary|Classical,Jazz,Pop|A rich acoustic sound and responsive touch, with space and regular tuning to consider.
Portable Keyboard|Keys|keyboard|Gentle|Headphones possible|Portable|Pop,Electronic,Songwriting|Light keys, built-in sounds, and rhythms offer an accessible introduction to making music.
Synthesizer|Keys|synth|Moderate|Headphones possible|Portable|Electronic,Ambient,Pop|Explore keys and sound design, creating your own textures, basses, and leads.
Accordion|Keys|accordion|Steep|Loud|Portable|Folk,Tango,Musette|Melody, bass, and chords in one instrument, powered by the movement of the bellows.
Melodica|Keys|melodica|Gentle|Medium|Very portable|Reggae,Pop,Folk|A small keyboard you blow into, combining a clear key layout with expressive breath control.
Concertina|Keys|accordion|Moderate|Medium|Very portable|Folk,Irish,Sea shanties|Compact bellows and buttons bring lively traditional tunes to a highly portable instrument.
Flute|Woodwind|flute|Moderate|Medium|Very portable|Classical,Jazz,Folk|An airy, agile voice with a bright upper range. Learning to shape the breath is the first step.
Clarinet|Woodwind|clarinet|Moderate|Medium|Very portable|Classical,Jazz,Klezmer|A versatile single-reed voice, warm in the low range and clear in the high notes.
Alto Saxophone|Woodwind|sax|Moderate|Loud|Portable|Jazz,Pop,Soul|A rich, expressive reed sound for memorable melodies and improvisation.
Tenor Saxophone|Woodwind|sax|Moderate|Loud|Portable|Jazz,Blues,Soul|A bigger saxophone with a warm, husky lower voice and plenty of expressive range.
Soprano Recorder|Woodwind|recorder|Gentle|Medium|Very portable|Early music,Classical,Folk|A simple, affordable wind instrument with a clear tone and an easy first note.
Alto Recorder|Woodwind|recorder|Moderate|Medium|Very portable|Baroque,Classical,Folk|A warmer recorder voice with a lower range, well suited to solo and ensemble music.
Tin Whistle|Woodwind|recorder|Gentle|Medium|Very portable|Irish,Celtic,Folk|Six finger holes and a bright tone make traditional melodies easy to begin exploring.
Harmonica|Woodwind|harmonica|Gentle|Medium|Pocket-sized|Blues,Folk,Country|Pocket-sized expression, from simple melodies to bent blues notes. Choose a key to start.
Oboe|Woodwind|clarinet|Steep|Loud|Portable|Classical,Chamber,Film|A focused double-reed voice with a distinctive singing tone and demanding breath control.
Bassoon|Woodwind|bassoon|Steep|Medium|Bulky|Classical,Chamber|A deep, characterful double-reed instrument for orchestral lines and playful melodies.
Ocarina|Woodwind|ocarina|Gentle|Medium|Pocket-sized|Folk,Game music,Traditional|A small vessel flute with a rounded tone, well suited to simple melodies.
Pan Flute|Woodwind|panflute|Moderate|Medium|Portable|Andean,Folk,Ambient|A row of tuned pipes produces soft, breathy melodies as you move between notes.
Trumpet|Brass|trumpet|Moderate|Loud|Portable|Jazz,Classical,Brass band|A brilliant, bold sound that shines in melodies and fanfares. Lip control develops over time.
Trombone|Brass|trombone|Moderate|Loud|Bulky|Jazz,Classical,Ska|A warm brass voice with a moving slide for smooth glides and precise pitch control.
French Horn|Brass|horn|Steep|Loud|Portable|Classical,Film,Chamber|A rounded, noble tone with a wide range. Careful listening and embouchure control are essential.
Euphonium|Brass|tuba|Moderate|Loud|Bulky|Brass band,Classical|A mellow low-brass voice that sings beautifully in lyrical melodies and ensembles.
Tuba|Brass|tuba|Moderate|Loud|Bulky|Brass band,Classical,Jazz|Deep, rounded bass notes form the foundation of brass groups and orchestras.
Cornet|Brass|trumpet|Moderate|Loud|Portable|Brass band,Jazz,Classical|A compact brass instrument with a softer, rounder voice than a trumpet.
Acoustic Drum Kit|Percussion|drums|Moderate|Loud|Stationary|Rock,Pop,Jazz|Build coordination and drive a band with kick, snare, toms, and cymbals. Needs practice space.
Electronic Drum Kit|Percussion|drums|Moderate|Headphones possible|Needs space|Rock,Pop,Electronic|Explore drum-kit rhythms through headphones, though pads and pedals still make impact noise.
Cajón|Percussion|cajon|Gentle|Medium|Portable|Flamenco,Acoustic,Pop|Sit on this wooden box and create bass and snare-like sounds with your hands.
Djembe|Percussion|djembe|Gentle|Loud|Portable|West African,World,Fusion|A hand drum with deep bass and bright slaps, inviting expressive rhythm and group playing.
Bongos|Percussion|bongos|Gentle|Medium|Portable|Latin,Salsa,Acoustic|Two small hand drums for crisp, conversational rhythms and playful accompaniment.
Congas|Percussion|djembe|Moderate|Loud|Bulky|Latin,Salsa,Funk|Tall hand drums with rich open tones for layered grooves and rhythmic interplay.
Handpan|Percussion|handpan|Gentle|Low|Portable|Ambient,World,Meditative|A resonant steel instrument with a fixed set of notes for flowing, melodic rhythms.
Kalimba|Percussion|kalimba|Gentle|Low|Pocket-sized|Folk,Ambient,Pop|Pluck metal tines with your thumbs for delicate, bell-like melodies and quiet practice.
Marimba|Percussion|marimba|Moderate|Medium|Stationary|Classical,Jazz,Contemporary|Warm wooden bars and resonators offer a wide melodic range for mallet players.
Glockenspiel|Percussion|marimba|Gentle|Medium|Portable|Classical,Pop,Ensemble|Bright metal bars make a sparkling sound and a clear introduction to melodic percussion.
Frame Drum|Percussion|frame|Gentle|Medium|Very portable|World,Folk,Traditional|A lightweight circular hand drum for exploring pulse, texture, and traditional rhythms.'''
colors = {'Strings': '#bd6b45', 'Keys': '#647969', 'Woodwind': '#77949a', 'Brass': '#bf933e', 'Percussion': '#a56b61'}

def art(kind, color, index):
    strings = ''.join(f'<path d="M{x} 39V211" stroke="#e8d6b8" stroke-width="1"/>' for x in range(145,157,2))
    keys = ''.join(f'<rect x="{60+i*12}" y="116" width="11" height="60" rx="2" fill="#fff8e8"/>' for i in range(15)) + ''.join(f'<rect x="{68+i*12}" y="116" width="6" height="35" rx="1" fill="#30332f"/>' for i in range(14) if i%7 not in [2,6])
    holes = ''.join(f'<circle cx="150" cy="{92+i*19}" r="4" fill="#253e3e"/>' for i in range(6))
    shapes = {
      'guitar': f'<path d="M131 126C99 110 92 143 109 162C76 182 101 225 150 224C199 225 224 182 191 162C208 143 201 110 169 126Z" fill="{color}"/><rect x="141" y="46" width="18" height="119" rx="4" fill="#715444"/><rect x="137" y="23" width="26" height="38" rx="7" fill="#8d6545"/><circle cx="150" cy="169" r="17" fill="#423a31"/><rect x="130" y="204" width="40" height="7" rx="2" fill="#493a31"/>{strings}',
      'electric': f'<path d="M125 115Q111 112 117 143Q90 176 111 212Q150 233 188 210Q208 178 174 145L168 111L159 141L141 145Z" fill="{color}"/><rect x="143" y="40" width="15" height="137" fill="#a37d57"/><path d="M143 41L141 16L164 22L158 43" fill="#ae8451"/>{strings}<path d="M137 175H168M137 196H166" stroke="#373b36" stroke-width="7"/>',
      'violin': f'<path d="M131 106Q107 111 118 140Q140 151 117 168Q106 209 150 214Q194 209 183 168Q160 151 182 140Q193 111 169 106Z" fill="{color}"/><rect x="144" y="41" width="12" height="129" rx="4" fill="#624a37"/><circle cx="150" cy="33" r="10" fill="#785940"/>{strings}<path d="M124 169l-4 17m59-17 4 17M212 31L200 220" stroke="#604a38" stroke-width="4"/>',
      'mandolin': f'<ellipse cx="150" cy="168" rx="48" ry="59" fill="{color}"/><rect x="144" y="32" width="12" height="119" rx="4" fill="#79563e"/><circle cx="150" cy="162" r="14" fill="#43372e"/>{strings}',
      'banjo': f'<circle cx="150" cy="175" r="50" fill="#b89163"/><circle cx="150" cy="175" r="43" fill="#f6edda"/><rect x="142" y="28" width="16" height="139" rx="5" fill="#7a6048"/>{strings}<path d="M135 204h30" stroke="#6e5540" stroke-width="5"/>',
      'harp': '<path d="M95 214L104 49Q137 17 205 47L105 214Z" fill="none" stroke="#b7894e" stroke-width="13"/>'+''.join(f'<path d="M{x} 46V{214-(x-105)*1.63}" stroke="#b7894e" stroke-width="2"/>' for x in range(118,194,11)),
      'keyboard': f'<rect x="49" y="87" width="202" height="99" rx="10" fill="{color}"/>{keys}<path d="M69 103h42m87 0h28" stroke="#dbe6cf" stroke-width="4"/>',
      'synth': f'<rect x="49" y="70" width="202" height="116" rx="10" fill="{color}"/>{keys}<rect x="142" y="82" width="45" height="23" rx="3" fill="#acd0b7"/>'+''.join(f'<circle cx="{70+i*20}" cy="93" r="6" fill="#303c36"/>' for i in range(3)),
      'piano': f'<path d="M63 171V86Q90 36 163 45Q224 55 236 125V171Z" fill="#3c443f"/>{keys}<path d="M71 179v40m153-40v40" stroke="#3c443f" stroke-width="12"/>',
      'accordion': f'<rect x="72" y="77" width="40" height="121" rx="8" fill="{color}"/><rect x="199" y="77" width="29" height="121" rx="7" fill="{color}"/>'+''.join(f'<path d="M{115+i*10} 85v106" stroke="#5c5244" stroke-width="6"/>' for i in range(8))+''.join(f'<rect x="77" y="{84+i*12}" width="28" height="10" fill="#f8edda"/>' for i in range(9)),
      'melodica': f'<rect x="96" y="71" width="108" height="131" rx="11" fill="{color}"/>'+''.join(f'<rect x="115" y="{79+i*13}" width="77" height="11" fill="#f8edda"/>' for i in range(9))+'<path d="M114 71Q110 36 152 39" fill="none" stroke="#79735e" stroke-width="8"/>',
      'flute': '<g transform="rotate(35 150 130)"><rect x="143" y="27" width="14" height="202" rx="6" fill="#a4aeaa"/>'+holes+'<path d="M143 58h-8v9h8" stroke="#85958c" stroke-width="4"/></g>',
      'recorder': f'<path d="M141 32h18l-3 50 9 135h-30l9-135Z" fill="{color}"/>{holes}',
      'clarinet': '<path d="M145 29h10l4 157 13 34h-44l13-34Z" fill="#414942"/>'+holes.replace('#253e3e','#b6bda6'),
      'bassoon': '<path d="M125 57v153q20 17 40 0V82" fill="none" stroke="#87614b" stroke-width="18"/><path d="M164 87V60q0-17 25-22" fill="none" stroke="#aaa690" stroke-width="5"/>'+holes,
      'sax': '<path d="M150 50q40-15 39 26l-8 90q-2 57-50 43q-31-10-25-52" fill="none" stroke="#bd913f" stroke-width="23"/><path d="M91 131l46 4-17 40-21-2Z" fill="#c8a150"/><path d="M150 50l-21 7" stroke="#3c443e" stroke-width="11"/>'+''.join(f'<circle cx="179" cy="{91+i*19}" r="5" fill="#e6c574"/>' for i in range(5)),
      'harmonica': '<g transform="rotate(-15 150 130)"><rect x="66" y="105" width="168" height="56" rx="9" fill="#b1b7ab"/><rect x="68" y="124" width="164" height="29" rx="3" fill="#555847"/>'+''.join(f'<rect x="{75+i*16}" y="129" width="10" height="17" rx="2" fill="#252e29"/>' for i in range(10))+'</g>',
      'ocarina': f'<path d="M96 104Q120 58 194 90Q237 117 193 166Q146 200 97 161L65 178L79 132Z" fill="{color}"/>'+''.join(f'<circle cx="{115+i*22}" cy="{117+(i%2)*18}" r="6" fill="#395b5d"/>' for i in range(4)),
      'panflute': ''.join(f'<rect x="{80+i*20}" y="65" width="18" height="{151-i*15}" rx="5" fill="#b99461"/>' for i in range(7))+'<path d="M80 96h137" stroke="#71523c" stroke-width="9"/>',
      'trumpet': '<path d="M65 122h139l36-23v63l-36-23H104q-24 0-24 23q0 22 24 22h67q24 0 24-22v-30" fill="none" stroke="#c4a15b" stroke-width="12"/><path d="M124 106v53m23-53v53m23-53v53" stroke="#b18d43" stroke-width="7"/>',
      'trombone': '<path d="M65 105h133l39-21v59l-39-21H83q-40 0-40 36t40 29h138" fill="none" stroke="#c4a15b" stroke-width="10"/><path d="M97 142h135q31 0 31 23t-31 22" fill="none" stroke="#aa873b" stroke-width="7"/>',
      'horn': '<circle cx="146" cy="145" r="51" fill="none" stroke="#b99143" stroke-width="14"/><circle cx="146" cy="145" r="30" fill="none" stroke="#c8a35c" stroke-width="9"/><path d="M179 111l26-58 40 40-46 39" fill="#c8a35c"/><path d="M114 110V69H87" fill="none" stroke="#b99143" stroke-width="8"/>',
      'tuba': '<path d="M99 78l-17-41h83l-23 41v111q0 38 40 11V108q-16-29-55 10v52" fill="none" stroke="#c4a15b" stroke-width="19"/><path d="M148 109v61m19-64v64" stroke="#967532" stroke-width="8"/>',
      'drums': f'<circle cx="150" cy="170" r="49" fill="{color}" stroke="#635b4e" stroke-width="6"/><circle cx="150" cy="170" r="40" fill="#dfd8c4"/><rect x="90" y="90" width="49" height="43" rx="8" fill="{color}"/><rect x="151" y="87" width="50" height="43" rx="8" fill="{color}"/><path d="M59 83v131m177-131v131m-94-42-18 52m34-52 18 52" stroke="#727968" stroke-width="4"/><ellipse cx="59" cy="83" rx="35" ry="9" fill="#c4aa6b"/><ellipse cx="236" cy="83" rx="35" ry="9" fill="#c4aa6b"/>',
      'cajon': f'<path d="M91 75l90-16 31 22v128l-94 15-27-21Z" fill="#8a6045"/><path d="M91 75l94 12v124l-94-8Z" fill="{color}"/><circle cx="199" cy="157" r="10" fill="#473e32"/>',
      'djembe': f'<path d="M101 73h98l-26 92 15 52h-76l15-52Z" fill="{color}"/><ellipse cx="150" cy="73" rx="50" ry="15" fill="#e7d9b9"/><path d="M112 88l22 77m51-77-22 77M120 93l17 111m41-111-15 111" stroke="#654c3b" stroke-width="3"/>',
      'bongos': f'<path d="M67 99l10 80h62l12-80m5 11 10 69h60l13-69" fill="{color}"/><ellipse cx="109" cy="99" rx="42" ry="17" fill="#e9d9b8"/><ellipse cx="198" cy="110" rx="41" ry="16" fill="#e9d9b8"/>',
      'handpan': '<ellipse cx="150" cy="151" rx="90" ry="58" fill="#617875"/><ellipse cx="150" cy="138" rx="85" ry="54" fill="#7f9590"/><ellipse cx="150" cy="123" rx="22" ry="15" fill="#a4b4a4"/>'+''.join(f'<ellipse cx="{x}" cy="{y}" rx="15" ry="11" fill="#596f69"/>' for x,y in [(99,124),(111,163),(150,173),(191,163),(202,124)]),
      'kalimba': '<rect x="101" y="69" width="99" height="139" rx="22" fill="#af7d50"/><circle cx="150" cy="161" r="19" fill="#694b32"/>'+''.join(f'<rect x="{113+i*10}" y="84" width="6" height="{65+24-abs(i-3.5)*8}" rx="3" fill="#dddcc6"/>' for i in range(8))+'<path d="M110 103h81" stroke="#6e604c" stroke-width="6"/>',
      'marimba': ''.join(f'<rect x="{58+i*23}" y="{80+i*5}" width="20" height="{110-i*9}" rx="4" fill="{color}"/>' for i in range(8))+'<path d="M62 215L208 64m-85 6 98 143" stroke="#6b624f" stroke-width="4"/><circle cx="210" cy="63" r="10" fill="#41594c"/><circle cx="122" cy="69" r="10" fill="#41594c"/>',
      'frame': '<ellipse cx="153" cy="143" rx="74" ry="80" fill="#946845"/><ellipse cx="143" cy="137" rx="69" ry="76" fill="#e2cf9f"/><ellipse cx="143" cy="137" rx="61" ry="68" fill="none" stroke="#c4ac7b" stroke-width="2"/>'
    }
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="260" viewBox="0 0 300 260"><title>Illustration of instrument</title><ellipse cx="150" cy="238" rx="74" ry="8" fill="#233e2e" opacity=".07"/><g transform="rotate({(index%3-1)*5} 150 130)">{shapes[kind]}</g></svg>'

catalogue=[]
for i,row in enumerate(ROWS.splitlines()):
    name,family,kind,curve,volume,portability,genres,description=row.split('|')
    slug=name.lower().replace('ó','o').replace(' ','-')
    catalogue.append(dict(id=slug,name=name,family=family,description=description,learningCurve=curve,practiceVolume=volume,portability=portability,genres=genres.split(','),image=f'/instruments/{slug}.svg'))
    (ROOT/'public'/'instruments'/f'{slug}.svg').write_text(art(kind,colors[family],i))
(ROOT/'data'/'instruments.json').write_text(json.dumps(catalogue,indent=2,ensure_ascii=False)+'\n')
print(f'Generated {len(catalogue)} instruments and illustrations.')
