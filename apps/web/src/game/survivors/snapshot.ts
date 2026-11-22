import { ENEMIES, HEROES, SYSTEMS, WEAPONS } from './content';
import { randomFrom, type Run } from './sim';

/**
 * Saves a run's whole state so it can resume exactly where it was.
 *
 * The run is an object graph, not a tree. A Bolt's target is also in the enemy
 * list, a chain link's endpoint is an enemy's own position vector, and Orbital
 * Strike chains keep Sets of enemies. JSON would copy those shared objects
 * apart, so the restored run would drift from the original. This format gives
 * every container an implicit number, in the order it is first written, and
 * writes later appearances as a reference to that number.
 *
 * Each value in the encoded tree is one of these:
 *
 * - a finite number (except -0), a string, a boolean or null, written as itself
 * - an array whose first element is a tag from `Tag`
 *
 * Objects list their values in the order of a key list ("shape") that is
 * written once, so repeated keys cost nothing. Numbers keep JSON's shortest
 * exact form, which is what lets the restored run match bit for bit.
 */
const Tag = {
  Array: 0,
  Object: 1,
  Ref: 2,
  Set: 3,
  Map: 4,
  Number: 5,
  Undefined: 6,
  Constant: 7,
} as const;

type Encoded = number | string | boolean | null | Encoded[];

export interface SavedState {
  format: 1;
  shapes: string[][];
  root: Encoded;
}

/**
 * The game's constant tables. A run points into them (an enemy's `spec`, for
 * example), so a snapshot names those objects instead of copying them.
 */
const constants = new Map<object, string>();
const constantsByName = new Map<string, object>();
function addConstants(value: unknown, path: string) {
  if (typeof value !== 'object' || value === null || constants.has(value))
    return;
  constants.set(value, path);
  constantsByName.set(path, value);
  for (const [key, child] of Object.entries(value))
    addConstants(child, `${path}.${key}`);
}
addConstants({ ENEMIES, HEROES, SYSTEMS, WEAPONS }, '');

function isPlain(value: object) {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function encodeState(root: unknown): SavedState {
  const ids = new Map<object, number>();
  const shapes: string[][] = [];
  const shapeIds = new Map<string, number>();
  const write = (value: unknown, path: string): Encoded => {
    switch (typeof value) {
      case 'number':
        if (Number.isFinite(value) && !Object.is(value, -0)) return value;
        return [Tag.Number, Object.is(value, -0) ? '-0' : String(value)];
      case 'string':
      case 'boolean':
        return value;
      case 'undefined':
        return [Tag.Undefined];
      case 'object':
        break;
      default:
        throw new Error(`Cannot save the ${typeof value} at ${path}`);
    }
    if (value === null) return null;
    const constant = constants.get(value);
    if (constant !== undefined) return [Tag.Constant, constant];
    const id = ids.get(value);
    if (id !== undefined) return [Tag.Ref, id];
    ids.set(value, ids.size);
    if (Array.isArray(value))
      return [
        Tag.Array,
        ...value.map((item, i) => write(item, `${path}[${i}]`)),
      ];
    if (value instanceof Set)
      return [Tag.Set, ...[...value].map((item) => write(item, `${path}{}`))];
    if (value instanceof Map)
      return [
        Tag.Map,
        ...[...value].flatMap(([key, item]) => [
          write(key, `${path}{key}`),
          write(item, `${path}{value}`),
        ]),
      ];
    if (!isPlain(value)) throw new Error(`Cannot save the object at ${path}`);
    const keys = Object.keys(value);
    const shapeKey = keys.join('\0');
    let shape = shapeIds.get(shapeKey);
    if (shape === undefined) {
      shape = shapes.length;
      shapes.push(keys);
      shapeIds.set(shapeKey, shape);
    }
    const record = value as Record<string, unknown>;
    return [
      Tag.Object,
      shape,
      ...keys.map((key) => write(record[key], `${path}.${key}`)),
    ];
  };
  return { format: 1, shapes, root: write(root, 'state') };
}

const specialNumbers: Record<string, number> = {
  '-0': -0,
  NaN: NaN,
  Infinity: Infinity,
  '-Infinity': -Infinity,
};

export function decodeState(saved: SavedState): unknown {
  if (saved?.format !== 1 || !Array.isArray(saved.shapes))
    throw new Error('Unknown snapshot format');
  const table: object[] = [];
  const read = (value: Encoded): unknown => {
    if (!Array.isArray(value)) return value;
    const [tag, ...rest] = value;
    switch (tag) {
      case Tag.Number:
        if (!((rest[0] as string) in specialNumbers))
          throw new Error('Invalid number in snapshot');
        return specialNumbers[rest[0] as string];
      case Tag.Undefined:
        return undefined;
      case Tag.Constant: {
        const constant = constantsByName.get(rest[0] as string);
        if (!constant) throw new Error(`Unknown constant ${rest[0]}`);
        return constant;
      }
      case Tag.Ref: {
        const target = table[rest[0] as number];
        if (!target) throw new Error('Invalid reference in snapshot');
        return target;
      }
      case Tag.Array: {
        const array: unknown[] = [];
        table.push(array);
        for (const item of rest) array.push(read(item));
        return array;
      }
      case Tag.Set: {
        const set = new Set<unknown>();
        table.push(set);
        for (const item of rest) set.add(read(item));
        return set;
      }
      case Tag.Map: {
        const map = new Map<unknown, unknown>();
        table.push(map);
        for (let i = 0; i < rest.length; i += 2)
          map.set(read(rest[i]), read(rest[i + 1]));
        return map;
      }
      case Tag.Object: {
        const keys = saved.shapes[rest[0] as number];
        if (!keys || keys.length !== rest.length - 1)
          throw new Error('Invalid object in snapshot');
        const object: Record<string, unknown> = {};
        table.push(object);
        keys.forEach((key, i) => (object[key] = read(rest[i + 1])));
        return object;
      }
      default:
        throw new Error('Invalid snapshot');
    }
  };
  return read(saved.root);
}

/** Save a run. Its generator is rebuilt from `rng` on restore. */
export function saveRun(run: Run): SavedState {
  return encodeState({ ...run, random: undefined });
}

export function restoreRun(saved: SavedState): Run {
  const run = decodeState(saved) as Run;
  if (typeof run?.rng?.state !== 'number' || !Array.isArray(run.enemies))
    throw new Error('Invalid run snapshot');
  run.random = randomFrom(run.rng);
  return run;
}
