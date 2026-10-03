/* Barangay coverage by branch office (from the ILECO area-office list).
   Edit here to add/remove towns or barangays. */
window.COVERAGE = {
  "natividad": {
    "Anilao": ["Agbatuan","Badiang","Balabag","Balunos","Cag-an","Camiros","Dangula-an","Guipis","Manganes","Medina","Mostro","Palaciawan","Palaypay","Pantalan","Poblacion","San Carlos","San Juan Crisostomo","San Rafael","San Roque","Serallo","Vista Alegre"],
    "Banate": ["Alacaygan","Bariga","Belen","Bobon","Bularan","Carmelo","De La Paz","Dugwakan","Fuentes","Juanico","Libertad","Magdalo","Maninila","Merced","Poblacion","San Salvador","Talokgangan","Zona Sur"],
    "Barotac Viejo": ["Bugnay","California","Del Pilar","De la Peña","General Luna","La Fortuna","Lipata","Natividad","Nueva Invencion","Nueva Sevilla","Poblacion","Puerto Princesa","Rizal","San Antonio","San Fernando","San Francisco","San Geronimo","San Juan","San Lucas","San Miguel","San Roque","Santiago","Santo Domingo","Santo Tomas","Ugasan","Vista Alegre"],
    "San Rafael": ["Aclon","Bagacay","Calaigang","Ilongbukid","Poblacion","Posadas","San Andres","San Dionisio","San Florentino"]
  },
  "sara": {
    "Ajuy": ["Adcadarao","Agbobolo","Badiangan","Barrido","Bato Biasong","Bay-ang","Bucana Bunglas","Central","Culasi","Lanjagan","Luca","Malayu-an","Mangorocoro","Nasidman","Pantalan Nabaye","Pantalan Navarro","Pedada","Pili","Pinantan Diel","Pinantan Elizalde","Pinay Espinosa","Poblacion","Progreso","Puente Bunglas","Punta Buri","Rojas","San Antonio","Santo Rosario","Silagon","Tagubanhan","Taguhangin","Tanduyan","Tipacla","Tubogan"],
    "Concepcion": ["Aglatayan","Agpipili","Bagongon","Batiti","Botlog","Calamigan","Dungon","Lo-ong","Macalbang","Macatunao","Malangabang","Matagda","New Jalandoni","Nipa","Plandico","Poblacion","Polopiña","Pulo Pino","Salvacion","San Jose","Talotu-an","Tambaliza","Tamis-ac","Tiolas","Tuod"],
    "Sara": ["Aguisasan","Alabidhan","Aldeguer","Ambolong","Anoring","Apelo","Apologista","Awis","Bagaygay","Bakabak","Bato","Batuan","Castor","Crespo","Del Castillo","Devera","Domingo","General Luna","Gil","Ilas Norte","Ilas Sur","Juaneza","Labigan","Lanciola","Latawan","Malapaya","Muyco","Padios","Pasisan","Poblacion Ilawod","Poblacion Ilaya","Posadas","Preciosa","Salcedo","San Nicolas","San Roque","San Vicente","Santiago","Tady","Tentay","Villahermosa","Zerrudo"],
    "Lemery": ["Agpipili","Almeñana","Anabo","Bankal","Buenavista","Cabantohan","Camasi","Capiñahan","Dalipe","Dapdapan","Gerona","Imba","Layog","Magsaysay","Marapal","Milan","Naba","Omio","Pacifico","Poblacion","Pontoc","San Antonio","San Diego","San Jose Norte","San Jose Sur","San Lucas","San Roque","Sinuagan","Tuburan","Velasco","Ymaris"],
    "San Dionisio": ["Amray","Bagaso","Bao","Bondolan","Bual","Cambuyan","Capinang","Cubay","Cudionan","Dugman","Madanlog","Mandu-awak","Mapili","Matala-ang","Naborot","Nipa","Odiongan","Pajo","Pangi","Pase","Poblacion","San Nicolas","Santol","Siason","Tamisan","Tansa","Tiabas","Tuble","Ubian"]
  },
  "pani-an": {
    "Batad": ["Alapasco","Alinsolong","Banban","Batad Viejo","Binon-an","Bolhog","Bulak Norte","Bulak Sur","Cabagohan","Calangag","Caw-i","Drancalan","Embarcadero","Hamod","Malico","Nangka","Pasayan","Poblacion","Quiazan Florete","Quiazan Lopez","Salong","Sta. Ana","Tanao","Tapi-an"],
    "Balasan": ["Ipil","Balanti-an","Batuan","Bacolod","Camambugan","Carles","Dolores","Gimamanay","Malapoc","Kinalkalan","Lawis","Mamhut Norte","Mamhut Sur","Maya","Pani-an","Aranjuez","Poblacion Norte","Poblacion Sur","Quiasan","Salong","Salvacion","Tingui-an","Sta. Ana","Zaragosa"],
    "Estancia": ["Bayas","Pa-on","Botongon","Daculan","Canoan","Bayuyan","Bulaqueña","Gogo","Jolog","Loguingot","Lonoy","Lumbia","Malbog","Manipulon","Poblacion Zone 1","Poblacion Zone 2","San Roque","Santa Ana","Tabuan","Tacbuyan","Tanza","Villa Pani-an","Calapdan","Daan Banwa"],
    "Carles": ["Abong","Alipata","Asluman","Bancal","Barangcalan","Barosbos","Binuluangan","Bito-on","Bolo","Buaya","Buenavista","Cabilao Grande","Cabilao Pequeño","Cabuguana","Cawayan","Dayhagan","Gabi","Granada","Guinticgan","Isla De Cana","Lantangan","Manlot","Nalumsan","Pantalan","Poblacion","Punta","Punta Batuanan","San Fernando","Tabugon","Talingting","Tarong","Tinigban","Tupaz"]
  }
};
window.COVERAGE.main = Object.assign({}, window.COVERAGE["natividad"], window.COVERAGE["sara"], window.COVERAGE["pani-an"]);
