import type { BotDifficulty } from '../shared/types.js';

/** Flavor names for bots, themed by difficulty: easy bots are lovable
    goofballs, medium bots are capable heroes, hard bots are the masterminds. */
const BOT_NAME_POOLS: Record<BotDifficulty, string[]> = {
  easy: [
    'Patrick Star',
    'Peter Griffin',
    'SpongeBob',
    'Joey Tribbiani',
    'Kronk',
    'Michael Scott',
    'Dory',
    'Homer Simpson',
    'Buddy the Elf',
    'Phoebe Buffay',
    'Dobby',
    'Hagrid',
    'Fred Weasley',
    'George Weasley',
    'Argus Filch',
    'Moaning Myrtle',
    'Samwell Tarly',
    'Hodor',
    'Samwise Gamgee',
    'Pippin Took',
    'Merry Brandybuck',
    'Bombur',
    'Naruto Uzumaki',
    'Rock Lee',
    'Might Guy',
    'Choji Akimichi',
  ],
  medium: [
    'Jon Snow',
    'Hermione Granger',
    'Tony Stark',
    'Katniss Everdeen',
    'Indiana Jones',
    'Ellen Ripley',
    'Steve Rogers',
    'Diana Prince',
    'Mulan',
    'Luke Skywalker',
    'Harry Potter',
    'Ron Weasley',
    'Neville Longbottom',
    'Luna Lovegood',
    'Cedric Diggory',
    'Ginny Weasley',
    'Arya Stark',
    'Daenerys Targaryen',
    'Brienne of Tarth',
    'Jaime Lannister',
    'Frodo Baggins',
    'Aragorn',
    'Legolas',
    'Gimli',
    'Thorin Oakenshield',
    'Bard the Bowman',
    'Sasuke Uchiha',
    'Kakashi Hatake',
    'Shikamaru Nara',
  ],
  hard: [
    'Thanos',
    'Darth Vader',
    'Hannibal Lecter',
    'Lex Luthor',
    'Tywin Lannister',
    'Moriarty',
    'Light Yagami',
    'Cersei Lannister',
    'Anton Chigurh',
    'Magneto',
    'Albus Dumbledore',
    'Severus Snape',
    'Tom Riddle',
    'Bellatrix Lestrange',
    'Gellert Grindelwald',
    'Petyr Baelish',
    'Ramsay Bolton',
    'Varys',
    'Sauron',
    'Saruman',
    'Witch-king of Angmar',
    'Smaug',
    'Madara Uchiha',
    'Orochimaru',
    'Itachi Uchiha',
  ],
};

function shuffled<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Draws the next bot name from a per-room, per-difficulty "shuffle bag": names come
 * out in random order with no repeats until the bag empties, at which point it's
 * refilled with a fresh shuffle of the whole pool (minus whatever's currently seated)
 * and dealing continues. This guarantees a freshly-added bot never immediately gets
 * the name a just-removed bot had, while heavy add/remove churn still cycles through
 * real character names indefinitely instead of degrading into generic "Easy Bot 4"
 * labels once the pool has technically been "used" once each.
 *
 * `bag` is the room's remaining names for this difficulty (empty/missing to start).
 * Returns the drawn name plus the bag's new state to store back on the room.
 */
export function drawBotName(
  bag: string[],
  difficulty: BotDifficulty,
  currentlyUsedNames: Set<string>,
): { name: string; remainingBag: string[] } {
  let candidates = bag.filter((name) => !currentlyUsedNames.has(name.toLowerCase()));
  if (candidates.length === 0) {
    candidates = shuffled(BOT_NAME_POOLS[difficulty]).filter((name) => !currentlyUsedNames.has(name.toLowerCase()));
  }

  const [name, ...remainingBag] = candidates;
  if (!name) {
    // Every name in the pool is currently seated — practically impossible given room size.
    const label = difficulty[0].toUpperCase() + difficulty.slice(1);
    let n = 1;
    while (currentlyUsedNames.has(`${label} Bot ${n}`.toLowerCase())) n++;
    return { name: `${label} Bot ${n}`, remainingBag: [] };
  }
  return { name, remainingBag };
}
