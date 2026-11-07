// ---------------------------------------------------------------------------
// Rival-dialogen: een kort gesprekje voor het gevecht en als de rival verslagen is.
// Per rival en per character dat op dat moment in het veld staat, met 2 varianten (random).
// r(...) = de rival praat, a(...) = jouw character. De stemming kiest het portret (talk_<id>_<mood>.png).
// Teksten aanpassen? Gewoon hier; elke regel past op ~2 regels in het tekstvak (max ~100 tekens).
// ---------------------------------------------------------------------------

export type Mood = 'normal' | 'happy' | 'angry' | 'sad' | 'smug';
export interface TalkLine { who: 'rival' | 'ally'; mood: Mood; text: string; }
export type Exchange = TalkLine[];
export interface RivalTalk { intro: Exchange[]; defeat: Exchange[]; }

const r = (mood: Mood, text: string): TalkLine => ({ who: 'rival', mood, text });
const a = (mood: Mood, text: string): TalkLine => ({ who: 'ally', mood, text });

/** RIVAL_TALK[rival][jouw character] */
export const RIVAL_TALK: Record<string, Record<string, RivalTalk>> = {
  // ------------------------------------------------------------- Rival Sonic
  sonic: {
    tails: {
      intro: [
        [r('happy', "Hey Tails! Show me how much you've learned. I won't go easy on you!"), a('angry', "I've been training, Sonic. This time I'll keep up!")],
        [r('smug', 'Ready to race, buddy? Try not to fall behind!'), a('normal', "I calculated your top speed. I'm ready for it!")],
      ],
      defeat: [
        [r('happy', "Whoa, nice one, Tails! You're not my little sidekick anymore."), a('happy', 'Hehe... you really mean it, Sonic?')],
        [r('smug', 'Okay, okay, you win this one. Mind if I tag along?'), a('happy', 'With you on the team? Just like old times!')],
      ],
    },
    knuckles: {
      intro: [
        [r('smug', 'Knuckles! Did Eggman trick you again, or did you just miss me?'), a('angry', 'Nobody tricked me! I just want to knock that grin off your face!')],
        [r('normal', "Still guarding that rock? Let's see if your fists can catch me!"), a('angry', "It's the Master Emerald! And you're going down!")],
      ],
      defeat: [
        [r('smug', 'Heh, you got lucky, Knucklehead.'), a('smug', "Lucky? Admit it, I'm just stronger than you.")],
        [r('happy', "Not bad! Guess I'll stick around and make sure you don't mess up."), a('angry', "Mess up? I'll show you who's messing up!")],
      ],
    },
    amy: {
      intro: [
        [a('happy', 'Sonic! You came all this way just to see me?'), r('sad', 'Uh... actually, I came here to battle, Amy!')],
        [r('normal', 'Amy, put the hammer down and nobody gets hurt!'), a('angry', 'Not until you promise to take me on a date!')],
      ],
      defeat: [
        [r('sad', 'Okay, okay! I give up! Just... please stop swinging that thing!'), a('happy', "Does that mean you're coming with me? Yay!")],
        [r('smug', "You've gotten way stronger, Amy. I'm impressed."), a('happy', 'Did you hear that? Sonic is impressed with me!')],
      ],
    },
    cream: {
      intro: [
        [r('happy', 'Hey Cream! You and Cheese wanna play?'), a('happy', "Yes please, Mr. Sonic! We'll do our very best!")],
        [r('normal', "I'll go easy on you two, alright?"), a('normal', 'Oh no, Mr. Sonic. Mother says you should always try your hardest!')],
      ],
      defeat: [
        [r('happy', 'Wow, you two make a great team!'), a('happy', 'Thank you very much, Mr. Sonic! Cheese is happy too!')],
        [r('smug', "Guess I can't call you a little kid anymore, huh?"), a('happy', 'Will you come with us? It would be so much fun!')],
      ],
    },
    shadow: {
      intro: [
        [r('smug', "Shadow! Wanna find out who's really the fastest thing alive?"), a('angry', "I've had enough of your games, faker.")],
        [r('normal', 'We keep running into each other, huh?'), a('normal', "Then this time, I'll make sure it's the last.")],
      ],
      defeat: [
        [r('angry', "Tch... you're faster than last time."), a('smug', 'Of course. I am the Ultimate Lifeform.')],
        [r('smug', 'Alright, you win. For now. Need a hand out there?'), a('normal', "Hmph. Try to keep up, if you're coming.")],
      ],
    },
  },

  // ------------------------------------------------------------- Rival Tails
  tails: {
    sonic: {
      intro: [
        [r('angry', 'Sonic, I want to prove I can stand on my own. Battle me!'), a('happy', "Now that's what I like to hear! Bring it on, little buddy!")],
        [r('normal', "I've built a few upgrades. Let's test them on you!"), a('smug', "Hope they're fast upgrades. I'm not waiting around!")],
      ],
      defeat: [
        [r('sad', "Aww... I still can't beat you, Sonic."), a('happy', "You came really close, Tails. Come on, let's go together!")],
        [r('happy', 'Hehe, that was so cool! Can I come with you?'), a('happy', "You don't even have to ask, buddy.")],
      ],
    },
    knuckles: {
      intro: [
        [r('normal', "Knuckles, I've worked out exactly how to beat you!"), a('angry', "Oh yeah? Let's see your fancy math stop my fists!")],
        [r('normal', 'My scanner says you have low defense against flying attacks!'), a('angry', 'Your scanner says WHAT?! Get down here and fight me!')],
      ],
      defeat: [
        [r('sad', "Ow... my calculations didn't account for brute force."), a('smug', "That's 'cause you can't calculate THIS!")],
        [r('happy', "Okay, you win! You'll need someone smart on your team, though."), a('normal', "...Fine. You can come. Just don't touch anything.")],
      ],
    },
    amy: {
      intro: [
        [r('normal', "Amy, have you seen Sonic? I'll ask again after I beat you!"), a('angry', "Hey! If anyone's finding Sonic first, it's me!")],
        [r('happy', 'Let\'s spar, Amy! I want to test my new tail spin!'), a('happy', "Okay! But I won't hold back with my Piko Piko Hammer!")],
      ],
      defeat: [
        [r('sad', 'Ouch! That hammer is no joke.'), a('happy', "Told you! Now come on, let's go find Sonic together.")],
        [r('happy', "You're really strong, Amy! Let me help you out."), a('happy', 'Yay! Another friend on the team!')],
      ],
    },
    cream: {
      intro: [
        [r('normal', "Cream, let's have a friendly battle. Just don't cry if you lose, okay?"), a('normal', "I won't cry, Mr. Tails! Cheese and I have been practicing!")],
        [r('happy', "Ready, Cream? I'll fly circles around you!"), a('happy', 'We can fly too! Come on, Cheese!')],
      ],
      defeat: [
        [r('sad', 'Wow... I lost to Cream and Cheese.'), a('happy', 'You did very well too, Mr. Tails! Will you come with us?')],
        [r('happy', "You two are really good! Let's team up!"), a('happy', 'Oh, how wonderful! Thank you, Mr. Tails!')],
      ],
    },
    shadow: {
      intro: [
        [r('angry', "Shadow! I'm not scared of you!"), a('smug', 'You should be.')],
        [r('normal', "I'm going to analyze your Chaos Control and stop it!"), a('angry', "You can try, fox. You'll fail.")],
      ],
      defeat: [
        [r('sad', 'How is he so strong...?'), a('normal', 'You fought well. For a child.')],
        [r('happy', 'Okay, you win! But you could use my help, you know.'), a('normal', "...Do what you want. Just don't slow me down.")],
      ],
    },
  },

  // ------------------------------------------------------------- Rival Knuckles
  knuckles: {
    sonic: {
      intro: [
        [r('angry', "Sonic! Eggman told me you're after the Master Emerald!"), a('smug', 'And you believed him? Again? Seriously, Knux?')],
        [r('angry', "This time, I'm taking you down for good!"), a('smug', 'Sure you are. Try to keep up!')],
      ],
      defeat: [
        [r('sad', 'Wait... did Eggman trick me again?'), a('happy', "Yup. Come on, let's go teach him a lesson.")],
        [r('angry', "Grr... fine! But I'm coming along to make sure you stay away from my Emerald!"), a('smug', 'Whatever makes you feel better.')],
      ],
    },
    tails: {
      intro: [
        [r('angry', "Tails? You're not getting past me!"), a('normal', "I don't want to fight you, Knuckles, but I will!")],
        [r('smug', 'Ha! You think your little gadgets can stop me?'), a('angry', "They're not little! Let me show you!")],
      ],
      defeat: [
        [r('sad', 'Huh?! I lost to Tails?!'), a('happy', 'Technology wins again! Want to join us?')],
        [r('normal', "Alright, you've earned my respect. I'll fight with you."), a('happy', "Awesome! With you, we're unstoppable!")],
      ],
    },
    amy: {
      intro: [
        [r('normal', 'Amy, go home. This is no place for you.'), a('angry', 'Excuse me?! Say that again to my hammer!')],
        [r('angry', "Out of my way! I'm looking for Eggman!"), a('angry', "So am I! But you're the one in MY way!")],
      ],
      defeat: [
        [r('sad', 'Ow, ow, ow! Okay, you made your point!'), a('happy', "Good! Now you're coming with me. We've got work to do!")],
        [r('normal', 'That hammer hits harder than Sonic...'), a('happy', "Of course it does! Now come on, let's go!")],
      ],
    },
    cream: {
      intro: [
        [r('sad', "Uh... I really don't want to fight a kid."), a('normal', "Please don't worry, Mr. Knuckles. We'll be very careful with you!")],
        [r('normal', "Alright, kid. Show me what you've got!"), a('happy', 'Here we go, Cheese! Chao!')],
      ],
      defeat: [
        [r('sad', 'How did I lose to a rabbit and a Chao?!'), a('happy', 'That was so much fun! Would you like to come with us?')],
        [r('normal', "Heh. You're tougher than you look, kid."), a('happy', "Thank you! Cheese says you're very strong too!")],
      ],
    },
    shadow: {
      intro: [
        [r('angry', "You! You're the one who took the Chaos Emerald!"), a('smug', "I don't steal. I take what I need.")],
        [r('angry', "Shadow, huh? Let's see if you're as tough as they say!"), a('smug', "I'm tougher.")],
      ],
      defeat: [
        [r('sad', "No way... my punches didn't even faze him!"), a('normal', "Your strength is real. Your aim isn't.")],
        [r('angry', "Fine! But I'm keeping an eye on you!"), a('smug', 'Do what you want. Just stay out of my way.')],
      ],
    },
  },

  // ------------------------------------------------------------- Rival Cream
  cream: {
    sonic: {
      intro: [
        [r('happy', 'Mr. Sonic! Please battle with us! Cheese wants to see how fast you are!'), a('happy', 'Sure thing! Just try not to blink!')],
        [r('normal', 'Mother says I should always ask nicely. May we fight you, Mr. Sonic?'), a('smug', "Ha! Since you asked so nicely, let's go!")],
      ],
      defeat: [
        [r('sad', 'Oh my... you really are the fastest, Mr. Sonic.'), a('happy', 'You two did great. Wanna come along?')],
        [r('happy', 'That was wonderful! May we come with you?'), a('happy', 'The more, the merrier!')],
      ],
    },
    tails: {
      intro: [
        [r('happy', "Mr. Tails! Let's see who flies better!"), a('normal', "You're on, Cream! I won't lose a flying contest!")],
        [r('normal', 'Cheese and I have been practicing very hard, Mr. Tails!'), a('happy', "Then let's see it! Don't hold back!")],
      ],
      defeat: [
        [r('sad', 'Oh dear, we lost... Cheese, are you okay?'), a('happy', 'You two were great! Come with us, Cream!')],
        [r('happy', "You're very strong, Mr. Tails! May we join you?"), a('happy', "Of course! It'll be fun with you around.")],
      ],
    },
    knuckles: {
      intro: [
        [r('normal', 'Excuse me, Mr. Knuckles. Would you battle with us, please?'), a('sad', 'Uh... are you sure about this, kid?')],
        [r('happy', 'Cheese says you have very big fists, Mr. Knuckles!'), a('smug', 'Heh. Wanna see them up close?')],
      ],
      defeat: [
        [r('sad', "You're very strong... Cheese, we need more practice."), a('sad', "Hey, don't be sad! You can come with me and train.")],
        [r('happy', 'Thank you for the battle, Mr. Knuckles!'), a('normal', 'Yeah, yeah. Stick close to me, alright?')],
      ],
    },
    amy: {
      intro: [
        [r('happy', "Miss Amy! Let's have a battle, just like we practiced!"), a('happy', "Alright, Cream! I'll show you what a real hammer can do!")],
        [r('normal', 'Miss Amy, Cheese wants a rematch from last time!'), a('smug', "Last time? Hehe, I'll win again!")],
      ],
      defeat: [
        [r('sad', 'Miss Amy is so strong...'), a('happy', "You did amazing, Cream! Come with me, let's go find Sonic!")],
        [r('happy', 'That was so much fun, Miss Amy! Can we come along?'), a('happy', "Of course! Girls' team, here we come!")],
      ],
    },
    shadow: {
      intro: [
        [r('normal', 'Mr. Shadow, you look lonely. Will you battle with us?'), a('angry', 'Lonely? ...Hmph. Fine.')],
        [r('happy', "Cheese isn't scared of you, Mr. Shadow!"), a('smug', 'Your Chao is braver than most.')],
      ],
      defeat: [
        [r('sad', 'Oh... you really are very strong, Mr. Shadow.'), a('normal', 'You fought bravely. Both of you.')],
        [r('happy', 'Thank you for the battle! May we come with you?'), a('normal', '...If you insist. Stay behind me.')],
      ],
    },
  },

  // ------------------------------------------------------------- Rival Amy
  amy: {
    sonic: {
      intro: [
        [r('happy', 'Sonic! There you are! If I win, you have to go on a date with me!'), a('sad', 'Uh-oh. Not this again...')],
        [r('angry', "You can't run from me forever, Sonic!"), a('smug', 'Watch me try!')],
      ],
      defeat: [
        [r('sad', 'Hmph! You never let me win, Sonic.'), a('happy', 'Aw, come on. You can come with us, Amy.')],
        [r('happy', "You're so cool when you fight, Sonic! I'm coming with you!"), a('sad', 'Did I ever have a choice?')],
      ],
    },
    tails: {
      intro: [
        [r('angry', "Tails! Where's Sonic? Tell me, or else!"), a('sad', "I-I don't know, Amy! Honest!")],
        [r('normal', "Let's see if you're as strong as Sonic, Tails!"), a('angry', "I'll show you I'm strong on my own!")],
      ],
      defeat: [
        [r('sad', "Okay, you got me. You're stronger than you look, Tails."), a('happy', 'Thanks, Amy! Want to search for Sonic with me?')],
        [r('happy', "Hehe, nice job! Let's find Sonic together!"), a('happy', "Alright, let's go!")],
      ],
    },
    knuckles: {
      intro: [
        [r('angry', "Out of my way, Knuckles! I'm looking for Sonic!"), a('angry', 'Nobody gives me orders! Not even you, Amy!')],
        [r('smug', 'You might be strong, but my hammer is stronger!'), a('smug', "Let's put that to the test!")],
      ],
      defeat: [
        [r('sad', "Ugh! My hammer didn't even dent you!"), a('smug', 'Of course not. Wanna tag along?')],
        [r('happy', "Okay, okay, you win! But I'm coming with you!"), a('sad', '...Do I get a say in this?')],
      ],
    },
    cream: {
      intro: [
        [r('happy', "Cream! Let's spar! Don't worry, I'll go easy on you."), a('happy', "Yes, Miss Amy! But we won't go easy on you!")],
        [r('normal', "Ready, Cream? Show me how much you've grown!"), a('happy', "Cheese, let's do our best!")],
      ],
      defeat: [
        [r('sad', 'Wow, Cream... you beat me fair and square.'), a('happy', 'Will you come with us, Miss Amy? Please?')],
        [r('happy', "You and Cheese are amazing! Let's stick together!"), a('happy', 'Oh, that would be lovely!')],
      ],
    },
    shadow: {
      intro: [
        [r('angry', "Shadow! If you hurt Sonic, you'll have to deal with me!"), a('smug', "I'm terrified.")],
        [r('normal', "You're not so scary. Watch this!"), a('angry', 'This is a waste of my time.')],
      ],
      defeat: [
        [r('sad', "Hmph! Fine, you're strong. Sonic's still cooler, though."), a('smug', '...Noted.')],
        [r('happy', "Okay, you win. I'm coming with you anyway!"), a('sad', '...Why does everyone keep saying that?')],
      ],
    },
  },
};

/** Een random gesprekje voor deze rival tegen dit character (of niks als er geen tekst voor is). */
export function pickTalk(rival: string, ally: string, when: 'intro' | 'defeat', rng: () => number = Math.random): Exchange | undefined {
  const list = RIVAL_TALK[rival]?.[ally]?.[when];
  if (!list?.length) return undefined;
  return list[Math.floor(rng() * list.length)];
}
