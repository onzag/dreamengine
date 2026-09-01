export const emotions = [
    // neutrals
    "neutral", "calm", "relaxed",
    // positives
    "happy", "joyful", "excited", "cheerful", "amused", "laughing", "grinning", "smiling", "content", "satisfied", "pleased", "delighted", "euphoric",
    // negatives
    "sad", "crying", "tearful", "depressed", "melancholic", "dissapointed", "hurt", "heartbroken",
    // angers
    "angry", "irritated", "frustrated", "annoyed", "resentful", "furious", "enraged",
    // surprises
    "surprised", "shocked", "astonished", "amazed", "startled",
    // fear/anxiety
    "fearful", "anxious", "nervous", "worried", "tense", "apprehensive", "panicked", "horrified", "terrified",
    // disgust
    "disgusted", "revolted", "nauseated", "sickened",
    // confusion
    "confused", "uncertain", "doubtful",
    // embarrassment
    "embarassed", "shy", "sheepish", "blushing", "ashamed", "guilty",
    // tired
    "tired", "sleepy", "exhausted", "fatigued",
    // boredom,
    "bored", "disinterested", "unengaged",
    // thoughtful
    "thoughtful", "pensive", "contemplative", "focused", "concentrated",
    // playful
    "playful", "mischievous", "teasing", "smirking",
    // affection
    "loving", "affectionate", "caring", "tender", "flirty", "enamored", "aroused",
    // pain
    "hurting", "aching", "sore", "agonizing", "suffering", "distressed",
    // determination
    "determined", "serious", "resolute", "steadfast", "persistent", "confident", "proud",
    // cold
    "cold", "indifferent", "detached"
]

export const emotionsGrouped = {
    neutral: ["neutral", "calm", "relaxed"],
    positive: ["happy", "joyful", "excited", "cheerful", "amused", "laughing", "grinning", "smiling", "content", "satisfied", "pleased", "delighted", "euphoric"],
    negative: ["sad", "crying", "tearful", "depressed", "melancholic", "dissapointed", "hurt", "heartbroken"],
    anger: ["angry", "irritated", "frustrated", "annoyed", "resentful", "furious", "enraged"],
    surprise: ["surprised", "shocked", "astonished", "amazed", "startled"],
    fear: ["fearful", "anxious", "nervous", "worried", "tense", "apprehensive", "panicked", "horrified", "terrified"],
    disgust: ["disgusted", "revolted", "nauseated", "sickened"],
    confusion: ["confused", "uncertain", "doubtful"],
    embarrassment: ["embarassed", "shy", "sheepish", "blushing", "ashamed", "guilty"],
    tired: ["tired", "sleepy", "exhausted", "fatigued"],
    boredom: ["bored", "disinterested", "unengaged"],
    thoughtful: ["thoughtful", "pensive", "contemplative", "focused", "concentrated"],
    playful: ["playful", "mischievous", "teasing", "smirking"],
    affection: ["loving", "affectionate", "caring", "tender", "flirty", "enamored", "aroused"],
    pain: ["hurting", "aching", "sore", "agonizing", "suffering", "distressed"],
    determination: ["determined", "serious", "resolute", "steadfast", "persistent", "confident", "proud"],
    cold: ["cold", "indifferent", "detached"]
}

/**
 * @type {Record<string, string>}
 */
export const emotionsToVoicePromptDescription = {
    // neutrals
    neutral: "a neutral, even-toned voice with no particular emotion",
    calm: "a calm, soft and relaxed voice, speaking slowly and gently",
    relaxed: "a relaxed, easygoing voice with a laid-back, unhurried tone",
    // positives
    happy: "a happy, cheerful voice with a warm and bright tone",
    joyful: "a joyful, bubbly voice full of delight and warmth",
    excited: "an excited, energetic voice, fast and full of enthusiasm",
    cheerful: "a cheerful, upbeat voice with a light and sunny tone",
    amused: "an amused voice with a light, playful chuckle in it",
    laughing: "a voice breaking into laughter, giggly and light-hearted",
    grinning: "a bright, grinning voice full of barely-contained delight",
    smiling: "a warm, smiling voice with a gentle, pleasant tone",
    content: "a content, satisfied voice, soft and quietly happy",
    satisfied: "a satisfied voice with a calm, pleased and settled tone",
    pleased: "a pleased, gently happy voice with a warm lift to it",
    delighted: "a delighted voice, bright and sparkling with happiness",
    euphoric: "a euphoric voice, overflowing with intense joy and excitement",
    // negatives
    sad: "a sad, subdued voice, quiet and heavy with sorrow",
    crying: "a trembling, tearful voice broken up by crying",
    tearful: "a tearful, wavering voice on the verge of tears",
    depressed: "a flat, low and lifeless voice weighed down by depression",
    melancholic: "a melancholic voice, soft and wistful with quiet sadness",
    dissapointed: "a disappointed voice, deflated and let down in tone",
    hurt: "a hurt, wounded voice, quiet and pained",
    heartbroken: "a heartbroken voice, fragile and aching with grief",
    // angers
    angry: "an angry voice, sharp and tense with rising heat",
    irritated: "an irritated voice, clipped and edged with annoyance",
    frustrated: "a frustrated voice, strained and tight with exasperation",
    annoyed: "an annoyed voice, short and impatient in tone",
    resentful: "a resentful voice, bitter and coldly simmering",
    furious: "a furious voice, loud, harsh and shaking with rage",
    enraged: "an enraged voice, explosive and roaring with fury",
    // surprises
    surprised: "a surprised voice, sharp and quick with sudden astonishment",
    shocked: "a shocked voice, breathless and stunned",
    astonished: "an astonished voice, wide and amazed with disbelief",
    amazed: "an amazed voice, bright and awestruck with wonder",
    startled: "a startled voice, jumpy and abrupt with sudden alarm",
    // fear/anxiety
    fearful: "a fearful voice, shaky and hushed with dread",
    anxious: "an anxious voice, tense and uneven with worry",
    nervous: "a nervous voice, hesitant and slightly trembling",
    worried: "a worried voice, strained and unsettled in tone",
    tense: "a tense, tightly controlled voice on edge",
    apprehensive: "an apprehensive voice, cautious and uneasy",
    panicked: "a panicked voice, fast, breathless and frantic",
    horrified: "a horrified voice, hushed and shaking with terror",
    terrified: "a terrified voice, trembling and thin with pure fear",
    // disgust
    disgusted: "a disgusted voice, curled with revulsion and distaste",
    revolted: "a revolted voice, recoiling and sharply repulsed",
    nauseated: "a nauseated voice, queasy and strained with sickness",
    sickened: "a sickened voice, heavy and repulsed in tone",
    // confusion
    confused: "a confused voice, uncertain and faltering",
    uncertain: "an uncertain, hesitant voice unsure of itself",
    doubtful: "a doubtful voice, skeptical and questioning in tone",
    // embarrassment
    embarassed: "an embarrassed voice, flustered and self-conscious",
    shy: "a shy, quiet voice, soft and a little hesitant",
    sheepish: "a sheepish voice, awkward and gently apologetic",
    blushing: "a bashful, blushing voice, warm and flustered",
    ashamed: "an ashamed voice, low and quiet with guilt",
    guilty: "a guilty voice, hesitant and heavy with remorse",
    // tired
    tired: "a tired voice, slow and heavy with weariness",
    sleepy: "a sleepy voice, soft, slurred and drowsy",
    exhausted: "an exhausted voice, drained and barely holding on",
    fatigued: "a fatigued voice, weary and low on energy",
    // boredom
    bored: "a bored voice, flat and monotone with disinterest",
    disinterested: "a disinterested voice, dull and detached",
    unengaged: "an unengaged voice, distant and indifferent in tone",
    // thoughtful
    thoughtful: "a thoughtful voice, measured and reflective",
    pensive: "a pensive voice, quiet and lost in thought",
    contemplative: "a contemplative voice, slow and deeply considering",
    focused: "a focused voice, steady and deliberate",
    concentrated: "a concentrated voice, intent and precise",
    // playful
    playful: "a playful voice, light, teasing and full of fun",
    mischievous: "a mischievous voice with a sly, impish grin in it",
    teasing: "a teasing voice, singsong and gently provoking",
    smirking: "a smirking voice, smug and quietly amused",
    // affection
    loving: "a loving voice, warm, tender and affectionate",
    affectionate: "an affectionate voice, soft and full of warmth",
    caring: "a caring voice, gentle, warm and reassuring",
    tender: "a tender voice, soft and delicately loving",
    flirty: "a flirty voice, playful and warmly teasing",
    enamored: "an enamored voice, dreamy and full of adoration",
    aroused: "a breathy, sultry voice, low and full of desire",
    // pain
    hurting: "a hurting voice, tight and pained",
    aching: "an aching voice, weary and sore with dull pain",
    sore: "a sore, strained voice, tender and uncomfortable",
    agonizing: "an agonized voice, sharp and gasping with intense pain",
    suffering: "a suffering voice, heavy and labored with distress",
    distressed: "a distressed voice, shaky and overwhelmed",
    // determination
    determined: "a determined voice, firm and resolute",
    serious: "a serious voice, grave and steady in tone",
    resolute: "a resolute voice, unwavering and strong",
    steadfast: "a steadfast voice, calm, firm and unshaken",
    persistent: "a persistent voice, insistent and unrelenting",
    confident: "a confident voice, self-assured and clear",
    proud: "a proud voice, bold and dignified",
    // cold
    cold: "a cold voice, flat and emotionless",
    indifferent: "an indifferent voice, detached and uninterested",
    detached: "a detached voice, distant and devoid of warmth"
}

export const emotionsToProfilePromptDescription = {
    // neutrals
    neutral: "A closeup profile portrait of the face of the character with a neutral expression, relaxed features, eyes calmly open, mouth in a natural resting line, showing no particular emotion",
    calm: "A closeup profile portrait of the face of the character with a calm, serene expression, softened features, gently relaxed eyes and a faint, peaceful ease across the face",
    relaxed: "A closeup profile portrait of the face of the character with a relaxed, easygoing expression, loose features, half-lidded relaxed eyes and a soft, content set to the mouth",
    // positives
    happy: "A closeup profile portrait of the face of the character with a happy expression, a bright genuine smile, cheeks lifted, eyes crinkled and warm",
    joyful: "A closeup profile portrait of the face of the character with a joyful expression, a wide beaming smile, glowing eyes and radiant, delighted cheeks",
    excited: "A closeup profile portrait of the face of the character with an excited expression, wide sparkling eyes, raised eyebrows and an eager open-mouthed smile",
    cheerful: "A closeup profile portrait of the face of the character with a cheerful expression, a light sunny smile, bright eyes and a friendly, upbeat glow",
    amused: "A closeup profile portrait of the face of the character with an amused expression, a playful half-smile, one eyebrow slightly raised and mirth in the eyes",
    laughing: "A closeup profile portrait of the face of the character laughing, head slightly tilted back, mouth wide open in laughter, eyes squeezed shut and cheeks raised",
    grinning: "A closeup profile portrait of the face of the character with a wide toothy grin, eyes bright and mischievous, cheeks fully lifted",
    smiling: "A closeup profile portrait of the face of the character with a warm gentle smile, softly curved lips, kind eyes and relaxed cheeks",
    content: "A closeup profile portrait of the face of the character with a content expression, a soft subtle smile, calm eyes and a peaceful, satisfied look",
    satisfied: "A closeup profile portrait of the face of the character with a satisfied expression, a small pleased smile, relaxed brow and settled, calm eyes",
    pleased: "A closeup profile portrait of the face of the character with a pleased expression, a gentle upward smile, warm eyes and a softly glowing face",
    delighted: "A closeup profile portrait of the face of the character with a delighted expression, a bright sparkling smile, wide happy eyes and glowing cheeks",
    euphoric: "A closeup profile portrait of the face of the character with a euphoric expression, an ecstatic radiant smile, shining eyes and a face overflowing with joy",
    // negatives
    sad: "A closeup profile portrait of the face of the character with a sad expression, downturned mouth, drooping eyes, lowered brows and a heavy, sorrowful look",
    crying: "A closeup profile portrait of the face of the character crying, tears streaming down the cheeks, scrunched brows, trembling downturned mouth and reddened eyes",
    tearful: "A closeup profile portrait of the face of the character with a tearful expression, glistening watery eyes brimming with tears, quivering lips and a fragile look",
    depressed: "A closeup profile portrait of the face of the character with a depressed expression, dull lifeless eyes, slack features, downcast gaze and a hollow, weary look",
    melancholic: "A closeup profile portrait of the face of the character with a melancholic expression, a wistful faraway gaze, softly downturned mouth and quiet sadness",
    dissapointed: "A closeup profile portrait of the face of the character with a disappointed expression, a deflated frown, lowered eyes and a let-down, sagging look",
    hurt: "A closeup profile portrait of the face of the character with a hurt expression, wounded pleading eyes, a slightly open pained mouth and pinched brows",
    heartbroken: "A closeup profile portrait of the face of the character with a heartbroken expression, anguished eyes welling with tears, a crumpled mouth and deep sorrow",
    // angers
    angry: "A closeup profile portrait of the face of the character with an angry expression, furrowed brows drawn together, narrowed intense eyes and a tight clenched jaw",
    irritated: "A closeup profile portrait of the face of the character with an irritated expression, slightly narrowed eyes, a pursed mouth and faintly knotted brows",
    frustrated: "A closeup profile portrait of the face of the character with a frustrated expression, tense knitted brows, clenched jaw and a strained, exasperated look",
    annoyed: "A closeup profile portrait of the face of the character with an annoyed expression, one eyebrow raised, a flat pressed mouth and a slightly rolled-eye look",
    resentful: "A closeup profile portrait of the face of the character with a resentful expression, a cold hard stare, tight lips and a bitter, simmering set to the face",
    furious: "A closeup profile portrait of the face of the character with a furious expression, deeply furrowed brows, blazing eyes, flared nostrils and bared teeth",
    enraged: "A closeup profile portrait of the face of the character with an enraged expression, contorted features, wild blazing eyes, snarling open mouth and pure fury",
    // surprises
    surprised: "A closeup profile portrait of the face of the character with a surprised expression, wide open eyes, raised eyebrows and a slightly agape mouth",
    shocked: "A closeup profile portrait of the face of the character with a shocked expression, eyes flung wide, brows shot up and mouth dropped open in disbelief",
    astonished: "A closeup profile portrait of the face of the character with an astonished expression, hugely widened eyes, high arched brows and a stunned open mouth",
    amazed: "A closeup profile portrait of the face of the character with an amazed expression, sparkling wide eyes, raised brows and an awestruck parted smile",
    startled: "A closeup profile portrait of the face of the character with a startled expression, eyes snapped wide, brows jumped up and a sharp caught-off-guard look",
    // fear/anxiety
    fearful: "A closeup profile portrait of the face of the character with a fearful expression, wide frightened eyes, raised inner brows and a tense, shrinking look",
    anxious: "A closeup profile portrait of the face of the character with an anxious expression, worried eyes, knitted brows, a tight mouth and an uneasy tension",
    nervous: "A closeup profile portrait of the face of the character with a nervous expression, darting uneasy eyes, a hesitant bitten lip and a faint sheen of tension",
    worried: "A closeup profile portrait of the face of the character with a worried expression, furrowed brows drawn upward, tense eyes and a downturned uneasy mouth",
    tense: "A closeup profile portrait of the face of the character with a tense expression, rigid features, tightly set jaw, narrowed eyes and strained brows",
    apprehensive: "A closeup profile portrait of the face of the character with an apprehensive expression, cautious wary eyes, slightly raised brows and a hesitant mouth",
    panicked: "A closeup profile portrait of the face of the character with a panicked expression, wide frantic eyes, raised brows, open gasping mouth and sheer alarm",
    horrified: "A closeup profile portrait of the face of the character with a horrified expression, eyes wide with dread, brows raised high and a mouth agape in terror",
    terrified: "A closeup profile portrait of the face of the character with a terrified expression, enormous fearful eyes, trembling features and a mouth frozen in fright",
    // disgust
    disgusted: "A closeup profile portrait of the face of the character with a disgusted expression, wrinkled nose, raised upper lip, narrowed eyes and a repulsed grimace",
    revolted: "A closeup profile portrait of the face of the character with a revolted expression, strongly scrunched nose, curled lip, recoiling head and deep distaste",
    nauseated: "A closeup profile portrait of the face of the character with a nauseated expression, a queasy greenish pallor, scrunched features and a sickly grimace",
    sickened: "A closeup profile portrait of the face of the character with a sickened expression, a repulsed grimace, wrinkled nose and heavy, unwell-looking eyes",
    // confusion
    confused: "A closeup profile portrait of the face of the character with a confused expression, one eyebrow raised, the other lowered, squinting eyes and a puzzled mouth",
    uncertain: "A closeup profile portrait of the face of the character with an uncertain expression, hesitant eyes, slightly raised brows and an unsure, wavering mouth",
    doubtful: "A closeup profile portrait of the face of the character with a doubtful expression, one skeptically raised eyebrow, narrowed eyes and a pursed, questioning mouth",
    // embarrassment
    embarassed: "A closeup profile portrait of the face of the character with an embarrassed expression, flushed cheeks, averted eyes and a self-conscious awkward smile",
    shy: "A closeup profile portrait of the face of the character with a shy expression, gently lowered gaze, faint blush and a small timid smile",
    sheepish: "A closeup profile portrait of the face of the character with a sheepish expression, an awkward apologetic half-smile, tilted head and slightly raised brows",
    blushing: "A closeup profile portrait of the face of the character with a blushing expression, deeply reddened cheeks, bashful eyes and a shy, flustered smile",
    ashamed: "A closeup profile portrait of the face of the character with an ashamed expression, lowered head, downcast eyes, flushed face and a guilt-tightened mouth",
    guilty: "A closeup profile portrait of the face of the character with a guilty expression, avoidant eyes, tense brows and a hesitant, remorseful mouth",
    // tired
    tired: "A closeup profile portrait of the face of the character with a tired expression, heavy half-lidded eyes, faint dark circles and a weary, slack mouth",
    sleepy: "A closeup profile portrait of the face of the character with a sleepy expression, drooping half-closed eyes, a mid-yawn mouth and drowsy, soft features",
    exhausted: "A closeup profile portrait of the face of the character with an exhausted expression, dull drained eyes, dark circles, sagging features and utter fatigue",
    fatigued: "A closeup profile portrait of the face of the character with a fatigued expression, weary heavy-lidded eyes, a listless mouth and worn, tired features",
    // boredom
    bored: "A closeup profile portrait of the face of the character with a bored expression, half-lidded disinterested eyes, a flat mouth and a slack, indifferent look",
    disinterested: "A closeup profile portrait of the face of the character with a disinterested expression, a blank flat gaze, unengaged eyes and an expressionless mouth",
    unengaged: "A closeup profile portrait of the face of the character with an unengaged expression, a distant vacant stare, relaxed brows and an indifferent set to the face",
    // thoughtful
    thoughtful: "A closeup profile portrait of the face of the character with a thoughtful expression, a reflective faraway gaze, slightly furrowed brow and a pensive mouth",
    pensive: "A closeup profile portrait of the face of the character with a pensive expression, a quiet distant gaze, softly knitted brows and a contemplative stillness",
    contemplative: "A closeup profile portrait of the face of the character with a contemplative expression, eyes lost in deep thought, a lightly creased brow and calm focus",
    focused: "A closeup profile portrait of the face of the character with a focused expression, intent sharp eyes, a slightly furrowed brow and a firmly set mouth",
    concentrated: "A closeup profile portrait of the face of the character with a concentrated expression, narrowed intent eyes, a tense focused brow and a tight, deliberate mouth",
    // playful
    playful: "A closeup profile portrait of the face of the character with a playful expression, a lively teasing smile, bright sparkling eyes and a mischievous glint",
    mischievous: "A closeup profile portrait of the face of the character with a mischievous expression, a sly crooked grin, one raised eyebrow and a scheming twinkle in the eyes",
    teasing: "A closeup profile portrait of the face of the character with a teasing expression, a smug playful smirk, raised brow and eyes dancing with fun",
    smirking: "A closeup profile portrait of the face of the character with a smirking expression, one corner of the mouth pulled up, half-lidded eyes and a smug, knowing look",
    // affection
    loving: "A closeup profile portrait of the face of the character with a loving expression, soft warm eyes, a tender gentle smile and an affectionate, glowing look",
    affectionate: "A closeup profile portrait of the face of the character with an affectionate expression, warm doting eyes, a soft smile and a gentle, caring tilt of the head",
    caring: "A closeup profile portrait of the face of the character with a caring expression, gentle concerned eyes, softened brows and a warm, reassuring smile",
    tender: "A closeup profile portrait of the face of the character with a tender expression, delicately soft eyes, a faint loving smile and a gentle, cherishing look",
    flirty: "A closeup profile portrait of the face of the character with a flirty expression, a coy playful smile, one raised eyebrow and a teasing, alluring glance",
    enamored: "A closeup profile portrait of the face of the character with an enamored expression, dreamy adoring eyes, a soft smitten smile and a warm, love-struck glow",
    aroused: "A closeup profile portrait of the face of the character with an aroused expression, half-lidded sultry eyes, flushed cheeks, parted lips and a heated, longing gaze",
    // pain
    hurting: "A closeup profile portrait of the face of the character with a hurting expression, pinched brows, tightly shut or wincing eyes and a pained, grimacing mouth",
    aching: "A closeup profile portrait of the face of the character with an aching expression, a weary wincing look, furrowed brows and a tight, uncomfortable mouth",
    sore: "A closeup profile portrait of the face of the character with a sore expression, a tender flinching look, slightly narrowed eyes and a strained, uncomfortable mouth",
    agonizing: "A closeup profile portrait of the face of the character with an agonized expression, tightly clenched eyes, deeply creased brows and a mouth gasping in pain",
    suffering: "A closeup profile portrait of the face of the character with a suffering expression, anguished strained features, furrowed brows and a heavy, pained mouth",
    distressed: "A closeup profile portrait of the face of the character with a distressed expression, wide troubled eyes, tense raised brows and an overwhelmed, shaken look",
    // determination
    determined: "A closeup profile portrait of the face of the character with a determined expression, firm focused eyes, a set jaw and lowered, resolute brows",
    serious: "A closeup profile portrait of the face of the character with a serious expression, a grave steady gaze, level brows and a firm, unsmiling mouth",
    resolute: "A closeup profile portrait of the face of the character with a resolute expression, unwavering intense eyes, a strong set jaw and a determined, firm mouth",
    steadfast: "A closeup profile portrait of the face of the character with a steadfast expression, calm unshaken eyes, a composed brow and a firmly settled, resolute mouth",
    persistent: "A closeup profile portrait of the face of the character with a persistent expression, insistent focused eyes, a stubbornly set jaw and unrelenting brows",
    confident: "A closeup profile portrait of the face of the character with a confident expression, a self-assured gaze, a slight assured smile and a raised, poised chin",
    proud: "A closeup profile portrait of the face of the character with a proud expression, a lifted chin, dignified eyes and a bold, self-satisfied smile",
    // cold
    cold: "A closeup profile portrait of the face of the character with a cold expression, an icy blank stare, expressionless features and a hard, unfeeling mouth",
    indifferent: "A closeup profile portrait of the face of the character with an indifferent expression, a flat detached gaze, relaxed brows and an uninterested, blank mouth",
    detached: "A closeup profile portrait of the face of the character with a detached expression, distant vacant eyes, an emotionless face and a cool, aloof stillness"
}