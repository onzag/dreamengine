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
    "embarrassed", "shy", "sheepish", "blushing", "ashamed", "guilty",
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

/**
 * @type {Record<string, string[]>}
 */
export const emotionsGrouped = {
    neutral: ["neutral", "calm", "relaxed"],
    positive: ["happy", "joyful", "excited", "cheerful", "amused", "laughing", "grinning", "smiling", "content", "satisfied", "pleased", "delighted", "euphoric"],
    negative: ["sad", "crying", "tearful", "depressed", "melancholic", "dissapointed", "hurt", "heartbroken"],
    anger: ["angry", "irritated", "frustrated", "annoyed", "resentful", "furious", "enraged"],
    surprise: ["surprised", "shocked", "astonished", "amazed", "startled"],
    fear: ["fearful", "anxious", "nervous", "worried", "tense", "apprehensive", "panicked", "horrified", "terrified"],
    disgust: ["disgusted", "revolted", "nauseated", "sickened"],
    confusion: ["confused", "uncertain", "doubtful"],
    embarrassment: ["embarrassed", "shy", "sheepish", "blushing", "ashamed", "guilty"],
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
    neutral: "neutral, even-toned",
    calm: "calm, soft, relaxed",
    relaxed: "relaxed, easygoing, laid-back",
    // positives
    happy: "happy, cheerful",
    joyful: "joyful, bubbly",
    excited: "excited, energetic, fast",
    cheerful: "cheerful, upbeat, light",
    amused: "amused, light, playful",
    laughing: "laughing, giggly, light-hearted",
    grinning: "grinning, bright, delighted",
    smiling: "smiling, warm, gentle",
    content: "content, satisfied, soft",
    satisfied: "satisfied, calm, pleased",
    pleased: "pleased, gently happy, warm",
    delighted: "delighted, bright, sparkling",
    euphoric: "euphoric, intense joy, excited",
    // negatives
    sad: "sad, low, heavy",
    crying: "trembling, tearful, crying",
    tearful: "tearful, wavering",
    depressed: "flat, low, lifeless",
    melancholic: "melancholic, soft, wistful",
    dissapointed: "disappointed, deflated, let down",
    hurt: "hurt, wounded, quiet",
    heartbroken: "heartbroken, fragile, aching",
    // angers
    angry: "angry, sharp, tense",
    irritated: "irritated, annoyed",
    frustrated: "frustrated, strained, tight",
    annoyed: "annoyed, short, impatient",
    resentful: "resentful, bitter",
    furious: "furious, loud, harsh",
    enraged: "enraged, explosive, shouting",
    // surprises
    surprised: "surprised, sharp, quick",
    shocked: "shocked, breathless, stunned",
    astonished: "astonished, wide, amazed",
    amazed: "amazed, bright",
    startled: "startled, jumpy, alarmed",
    // fear/anxiety
    fearful: "fearful, shaky, hushed",
    anxious: "anxious, tense",
    nervous: "nervous, hesitant, trembling",
    worried: "worried, strained, unsettling",
    tense: "tense, on edge",
    apprehensive: "apprehensive, uneasy, cautious",
    panicked: "panicked, fast, breathless, frantic",
    horrified: "horrified, hushed, shaking",
    terrified: "terrified, trembling, shaky, breathless",
    // disgust
    disgusted: "disgusted",
    revolted: "revolted, repulsed, harsh",
    nauseated: "nauseated, queasy, uneasy",
    sickened: "sickened, repulsed, uneasy",
    // confusion
    confused: "confused, puzzled, uncertain",
    uncertain: "uncertain, hesitant, unsure",
    doubtful: "doubtful, skeptical, questioning",
    // embarrassment
    embarrassed: "embarrassed, flustered, awkward",
    shy: "quiet, shy, hesitant",
    sheepish: "apologetic, sheepish, awkward",
    blushing: "flushed, shy, embarrassed",
    ashamed: "ashamed, low, quiet ",
    guilty: "guilty, hesitant, heavy",
    // tired
    tired: "tired, slow, heavy, weary",
    sleepy: "sleepy, soft, slurred, drowsy",
    exhausted: "exhausted, drained, depleted",
    fatigued: "fatigued, weary, low-energy",
    // boredom
    bored: "bored, flat, monotone",
    disinterested: "disinterested, dull, detached",
    unengaged: "unengaged, distant, indifferent",
    // thoughtful
    thoughtful: "thoughtful, measured, reflective",
    pensive: "pensive, quiet, introspective",
    contemplative: "contemplative, slow, deliberate",
    focused: "focused, steady, deliberate",
    concentrated: "concentrated, intent, precise",
    // playful
    playful: "playful, light, teasing, fun",
    mischievous: "mischievous, sly, impish",
    teasing: "teasing, singsong, provoking",
    smirking: "smirking, smug, amused",
    // affection
    loving: "loving, warm, tender, affectionate",
    affectionate: "affectionate, soft, warm",
    caring: "caring, gentle, warm, reassuring",
    tender: "tender, soft, gentle, loving",
    flirty: "flirty, playful, teasing",
    enamored: "enamored, dreamy, adoring",
    aroused: "breathy, sultry, low, desiring",
    // pain
    hurting: "hurting, tight, pained",
    aching: "aching, weary, sore, pained",
    sore: "sore, strained, tender, uncomfortable",
    agonizing: "agonizing, sharp, gasping, pained",
    suffering: "suffering, heavy, labored, distressed",
    distressed: "distressed, shaky, overwhelmed",
    // determination
    determined: "determined, firm, resolute",
    serious: "serious, grave, steady",
    resolute: "resolute, unwavering, strong",
    steadfast: "steadfast, calm, firm, unshaken",
    persistent: "persistent, insistent, unrelenting",
    confident: "confident, self-assured, clear",
    proud: "proud, bold, dignified",
    // cold
    cold: "cold, flat, emotionless",
    indifferent: "indifferent, detached, uninterested",
    detached: "detached, distant, cold"
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
    embarrassed: "A closeup profile portrait of the face of the character with an embarrassed expression, flushed cheeks, averted eyes and a self-conscious awkward smile",
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