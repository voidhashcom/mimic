import { Effect, Random } from "effect"

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface IndexCharacterSetOptions {
  chars: string // sorted string of unique characters like "0123456789ABC"
  jitterRange?: number // default is 1/5 of the total range created by adding 3 characters
  firstPositive?: string // default is the middle character
  mostPositive?: string // default is the last character
  mostNegative?: string // default is the first character
}

export interface IndexedCharacterSet {
  chars: string
  byChar: Record<string, number>
  byCode: Record<number, string>
  paddingDict: Record<number, number>
  length: number
  first: string
  last: string
  firstPositive: string
  mostPositive: string
  firstNegative: string
  mostNegative: string
  jitterRange: number
}

export type IntegerLimits = {
  firstPositive: string
  mostPositive: string
  firstNegative: string
  mostNegative: string
}

export interface GeneratorOptions {
  charSet?: IndexedCharacterSet
  useJitter?: boolean
  groupIdLength?: number
}

// ============================================================================
// Character Set Functions
// ============================================================================

type CharSetDicts = {
  byCode: Record<number, string>
  byChar: Record<string, number>
  length: number
}

function createCharSetDicts(charSet: string): CharSetDicts {
  const byCode: Record<number, string> = {}
  const byChar: Record<string, number> = {}
  const length = charSet.length

  for (let i = 0; i < length; i++) {
    const char = charSet[i]
    if (char === undefined) {
      throw new Error("invalid charSet: missing character at index " + i)
    }
    byCode[i] = char
    byChar[char] = i
  }
  return {
    byCode: byCode,
    byChar: byChar,
    length: length,
  }
}

function integerLimits(
  dicts: CharSetDicts,
  firstPositive?: string,
  mostPositive?: string,
  mostNegative?: string
): Effect.Effect<IntegerLimits, Error> {
  return Effect.gen(function* () {
    const firstPositiveIndex = firstPositive
      ? dicts.byChar[firstPositive]
      : Math.ceil(dicts.length / 2)
    const mostPositiveIndex = mostPositive
      ? dicts.byChar[mostPositive]
      : dicts.length - 1
    const mostNegativeIndex = mostNegative ? dicts.byChar[mostNegative] : 0

    if (
      firstPositiveIndex === undefined ||
      mostPositiveIndex === undefined ||
      mostNegativeIndex === undefined
    ) {
      return yield* Effect.fail(new Error("invalid charSet"))
    }
    if (mostPositiveIndex - firstPositiveIndex < 3) {
      return yield* Effect.fail(
        new Error("mostPositive must be at least 3 characters away from neutral")
      )
    }
    if (firstPositiveIndex - mostNegativeIndex < 3) {
      return yield* Effect.fail(
        new Error("mostNegative must be at least 3 characters away from neutral")
      )
    }

    const firstPositiveChar = dicts.byCode[firstPositiveIndex]
    const mostPositiveChar = dicts.byCode[mostPositiveIndex]
    const firstNegativeChar = dicts.byCode[firstPositiveIndex - 1]
    const mostNegativeChar = dicts.byCode[mostNegativeIndex]

    if (
      firstPositiveChar === undefined ||
      mostPositiveChar === undefined ||
      firstNegativeChar === undefined ||
      mostNegativeChar === undefined
    ) {
      return yield* Effect.fail(new Error("invalid charSet"))
    }

    return {
      firstPositive: firstPositiveChar,
      mostPositive: mostPositiveChar,
      firstNegative: firstNegativeChar,
      mostNegative: mostNegativeChar,
    }
  })
}

function paddingDict(jitterRange: number, charSetLength: number): Record<number, number> {
  const paddingDict: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const value = Math.pow(charSetLength, i)
    paddingDict[i] = value
    if (value > jitterRange) {
      break
    }
  }
  return paddingDict
}

export function validateChars(characters: string): Effect.Effect<void, Error> {
  if (characters.length < 7) {
    return Effect.fail(new Error("charSet must be at least 7 characters long"))
  }
  const chars = characters.split("")
  const sorted = chars.sort()
  const isEqual = sorted.join("") === characters
  if (!isEqual) {
    return Effect.fail(new Error("charSet must be sorted"))
  }
  return Effect.void
}

export function indexCharacterSet(
  options: IndexCharacterSetOptions
): Effect.Effect<IndexedCharacterSet, Error> {
  return Effect.gen(function* () {
    yield* validateChars(options.chars)
    const dicts = createCharSetDicts(options.chars)
    const limits = yield* integerLimits(
      dicts,
      options.firstPositive,
      options.mostPositive,
      options.mostNegative
    )
    // 1/5 of the total range if we add 3 characters, TODO: feels a bit arbitrary and could be improved
    const jitterRange =
      options.jitterRange ?? Math.floor(Math.pow(dicts.length, 3) / 5)

    const paddingRange = paddingDict(jitterRange, dicts.length)

    const first = dicts.byCode[0]
    const last = dicts.byCode[dicts.length - 1]

    if (first === undefined || last === undefined) {
      return yield* Effect.fail(new Error("invalid charSet"))
    }

    return {
      chars: options.chars,
      byChar: dicts.byChar,
      byCode: dicts.byCode,
      length: dicts.length,
      first,
      last,
      firstPositive: limits.firstPositive,
      mostPositive: limits.mostPositive,
      firstNegative: limits.firstNegative,
      mostNegative: limits.mostNegative,
      jitterRange,
      paddingDict: paddingRange,
    }
  })
}

// cache the base62 charSet since it's the default
let _base62CharSet: IndexedCharacterSet | null = null

export function base62CharSet(): IndexedCharacterSet {
  if (_base62CharSet) return _base62CharSet
  // We use Effect.runSync here because base62CharSet is a synchronous API
  // and we know the parameters are valid
  _base62CharSet = Effect.runSync(
    indexCharacterSet({
      // Base62 are all the alphanumeric characters, database and user friendly
      // For shorter strings and more room you could opt for more characters
      chars: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
      // This gives us nice human readable keys to start with a0 a1 etc
      firstPositive: "a",
      mostPositive: "z",
      mostNegative: "A",
    })
  )
  return _base62CharSet
}

// ============================================================================
// Padding Functions
// ============================================================================

export function makeSameLength(
  a: string,
  b: string,
  pad: "start" | "end",
  fillChar: string,
  forceLength?: number
): [string, string] {
  const max = forceLength ?? Math.max(a.length, b.length)
  if (pad === "start") {
    return [a.padStart(max, fillChar), b.padStart(max, fillChar)]
  }
  return [a.padEnd(max, fillChar), b.padEnd(max, fillChar)]
}

// ============================================================================
// Integer Length Functions
// ============================================================================

function distanceBetween(
  a: string,
  b: string,
  charSet: IndexedCharacterSet
): Effect.Effect<number, Error> {
  const indexA = charSet.byChar[a]
  const indexB = charSet.byChar[b]
  if (indexA === undefined || indexB === undefined) {
    return Effect.fail(new Error("invalid character in distance calculation"))
  }
  return Effect.succeed(Math.abs(indexA - indexB))
}

function integerLengthFromSecondLevel(
  key: string,
  direction: "positive" | "negative",
  charSet: IndexedCharacterSet
): Effect.Effect<number, Error> {
  if (key.length === 0) {
    return Effect.succeed(0)
  }
  const firstChar = key[0]
  if (!firstChar || firstChar > charSet.mostPositive || firstChar < charSet.mostNegative) {
    return Effect.fail(new Error("invalid firstChar on key"))
  }
  if (firstChar === charSet.mostPositive && direction === "positive") {
    return Effect.gen(function* () {
      const totalPositiveRoom = yield* distanceBetween(firstChar, charSet.mostNegative, charSet)
      const rest = yield* integerLengthFromSecondLevel(key.slice(1), direction, charSet)
      return totalPositiveRoom + 1 + rest
    })
  }
  if (firstChar === charSet.mostNegative && direction === "negative") {
    return Effect.gen(function* () {
      const totalNegativeRoom = yield* distanceBetween(firstChar, charSet.mostPositive, charSet)
      const rest = yield* integerLengthFromSecondLevel(key.slice(1), direction, charSet)
      return totalNegativeRoom + 1 + rest
    })
  }
  if (direction === "positive") {
    return Effect.gen(function* () {
      const dist = yield* distanceBetween(firstChar, charSet.mostNegative, charSet)
      return dist + 2
    })
  } else {
    return Effect.gen(function* () {
      const dist = yield* distanceBetween(firstChar, charSet.mostPositive, charSet)
      return dist + 2
    })
  }
}

export function integerLength(
  head: string,
  charSet: IndexedCharacterSet
): Effect.Effect<number, Error> {
  if (head.length === 0) {
    return Effect.fail(new Error("head cannot be empty"))
  }
  const firstChar = head[0]
  if (!firstChar || firstChar > charSet.mostPositive || firstChar < charSet.mostNegative) {
    return Effect.fail(new Error("invalid firstChar on key"))
  }
  if (firstChar === charSet.mostPositive) {
    return Effect.gen(function* () {
      const firstLevel = yield* distanceBetween(firstChar, charSet.firstPositive, charSet)
      const rest = yield* integerLengthFromSecondLevel(head.slice(1), "positive", charSet)
      return firstLevel + 1 + rest
    })
  }
  if (firstChar === charSet.mostNegative) {
    return Effect.gen(function* () {
      const firstLevel = yield* distanceBetween(firstChar, charSet.firstNegative, charSet)
      const rest = yield* integerLengthFromSecondLevel(head.slice(1), "negative", charSet)
      return firstLevel + 1 + rest
    })
  }
  const isPositiveRange = firstChar >= charSet.firstPositive
  if (isPositiveRange) {
    return Effect.gen(function* () {
      const dist = yield* distanceBetween(firstChar, charSet.firstPositive, charSet)
      return dist + 2
    })
  } else {
    return Effect.gen(function* () {
      const dist = yield* distanceBetween(firstChar, charSet.firstNegative, charSet)
      return dist + 2
    })
  }
}

// ============================================================================
// Key as Number Functions
// ============================================================================

export function encodeToCharSet(int: number, charSet: IndexedCharacterSet): Effect.Effect<string, Error> {
  if (int === 0) {
    const zero = charSet.byCode[0]
    if (zero === undefined) {
      return Effect.fail(new Error("invalid charSet: missing code 0"))
    }
    return Effect.succeed(zero)
  }
  let res = ""
  const max = charSet.length
  while (int > 0) {
    const code = charSet.byCode[int % max]
    if (code === undefined) {
      return Effect.fail(new Error("invalid character code in encodeToCharSet"))
    }
    res = code + res
    int = Math.floor(int / max)
  }
  return Effect.succeed(res)
}

export function decodeCharSetToNumber(
  key: string,
  charSet: IndexedCharacterSet
): number {
  let res = 0
  const length = key.length
  const max = charSet.length
  for (let i = 0; i < length; i++) {
    const char = key[i]
    if (char === undefined) {
      continue
    }
    const charIndex = charSet.byChar[char]
    if (charIndex === undefined) {
      continue
    }
    res += charIndex * Math.pow(max, length - i - 1)
  }
  return res
}

export function addCharSetKeys(
  a: string,
  b: string,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error> {
  const base = charSet.length
  const [paddedA, paddedB] = makeSameLength(a, b, "start", charSet.first)

  const result: string[] = []
  let carry = 0

  // Iterate over the digits from right to left
  for (let i = paddedA.length - 1; i >= 0; i--) {
    const charA = paddedA[i]
    const charB = paddedB[i]
    if (!charA || !charB) {
      return Effect.fail(new Error("invalid character in addCharSetKeys"))
    }
    const digitA = charSet.byChar[charA]
    const digitB = charSet.byChar[charB]
    if (digitA === undefined || digitB === undefined) {
      return Effect.fail(new Error("invalid character in addCharSetKeys"))
    }
    const sum = digitA + digitB + carry
    carry = Math.floor(sum / base)
    const remainder = sum % base

    const codeChar = charSet.byCode[remainder]
    if (codeChar === undefined) {
      return Effect.fail(new Error("invalid character code in addCharSetKeys"))
    }
    result.unshift(codeChar)
  }

  // If there's a carry left, add it to the result
  if (carry > 0) {
    const carryChar = charSet.byCode[carry]
    if (carryChar === undefined) {
      return Effect.fail(new Error("invalid carry character code"))
    }
    result.unshift(carryChar)
  }

  return Effect.succeed(result.join(""))
}

export function subtractCharSetKeys(
  a: string,
  b: string,
  charSet: IndexedCharacterSet,
  stripLeadingZeros = true
): Effect.Effect<string, Error> {
  const base = charSet.length
  const [paddedA, paddedB] = makeSameLength(a, b, "start", charSet.first)

  const result: string[] = []
  let borrow = 0

  // Iterate over the digits from right to left
  for (let i = paddedA.length - 1; i >= 0; i--) {
    const charA = paddedA[i]
    const charB = paddedB[i]
    if (!charA || !charB) {
      return Effect.fail(new Error("invalid character in subtractCharSetKeys"))
    }
    let digitA = charSet.byChar[charA]
    const digitBValue = charSet.byChar[charB]
    if (digitA === undefined || digitBValue === undefined) {
      return Effect.fail(new Error("invalid character in subtractCharSetKeys"))
    }
    const digitB = digitBValue + borrow

    // Handle borrowing
    if (digitA < digitB) {
      borrow = 1
      digitA += base
    } else {
      borrow = 0
    }

    const difference = digitA - digitB
    const codeChar = charSet.byCode[difference]
    if (codeChar === undefined) {
      return Effect.fail(new Error("invalid character code in subtractCharSetKeys"))
    }
    result.unshift(codeChar)
  }

  // If there's a borrow left, we have a negative result, which is not supported
  if (borrow > 0) {
    return Effect.fail(
      new Error("Subtraction result is negative. Ensure a is greater than or equal to b.")
    )
  }

  // Remove leading zeros
  while (
    stripLeadingZeros &&
    result.length > 1 &&
    result[0] === charSet.first
  ) {
    result.shift()
  }

  return Effect.succeed(result.join(""))
}

export function incrementKey(key: string, charSet: IndexedCharacterSet): Effect.Effect<string, Error> {
  const one = charSet.byCode[1]
  if (one === undefined) {
    return Effect.fail(new Error("invalid charSet: missing code 1"))
  }
  return addCharSetKeys(key, one, charSet)
}

export function decrementKey(key: string, charSet: IndexedCharacterSet): Effect.Effect<string, Error> {
  // we should not strip leading zeros here, this will break the sorting if the key already has leading zeros
  const one = charSet.byCode[1]
  if (one === undefined) {
    return Effect.fail(new Error("invalid charSet: missing code 1"))
  }
  return subtractCharSetKeys(key, one, charSet, false)
}

export function lexicalDistance(
  a: string,
  b: string,
  charSet: IndexedCharacterSet
): Effect.Effect<number, Error> {
  const [lower, upper] = makeSameLength(a, b, "end", charSet.first).sort()
  return Effect.gen(function* () {
    const distance = yield* subtractCharSetKeys(upper, lower, charSet)
    return decodeCharSetToNumber(distance, charSet)
  })
}

export function midPoint(
  lower: string,
  upper: string,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    let [paddedLower, paddedUpper] = makeSameLength(
      lower,
      upper,
      "end",
      charSet.first
    )
    let distance = yield* lexicalDistance(paddedLower, paddedUpper, charSet)
    if (distance === 1) {
      // if the numbers are consecutive we need more padding
      paddedLower = paddedLower.padEnd(paddedLower.length + 1, charSet.first)
      // the new distance will always be the length of the charSet
      distance = charSet.length
    }
    const mid = yield* encodeToCharSet(Math.floor(distance / 2), charSet)
    return yield* addCharSetKeys(paddedLower, mid, charSet)
  })
}

// ============================================================================
// Integer Functions
// ============================================================================

export function startKey(charSet: IndexedCharacterSet): string {
  return charSet.firstPositive + charSet.byCode[0]
}

export function validInteger(integer: string, charSet: IndexedCharacterSet): Effect.Effect<boolean, Error> {
  return Effect.gen(function* () {
    const length = yield* integerLength(integer, charSet)
    return length === integer.length
  })
}

export function validateOrderKey(
  orderKey: string,
  charSet: IndexedCharacterSet
): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    yield* getIntegerPart(orderKey, charSet)
  })
}

export function getIntegerPart(
  orderKey: string,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const head = integerHead(orderKey, charSet)
    const integerPartLength = yield* integerLength(head, charSet)
    if (integerPartLength > orderKey.length) {
      return yield* Effect.fail(new Error("invalid order key length: " + orderKey))
    }
    return orderKey.slice(0, integerPartLength)
  })
}

function validateInteger(integer: string, charSet: IndexedCharacterSet): Effect.Effect<void, Error> {
  return Effect.gen(function* () {
    const isValid = yield* validInteger(integer, charSet)
    if (!isValid) {
      return yield* Effect.fail(new Error("invalid integer length: " + integer))
    }
  })
}

export function integerHead(integer: string, charSet: IntegerLimits): string {
  let i = 0
  if (integer[0] === charSet.mostPositive) {
    while (integer[i] === charSet.mostPositive) {
      i = i + 1
    }
  }
  if (integer[0] === charSet.mostNegative) {
    while (integer[i] === charSet.mostNegative) {
      i = i + 1
    }
  }
  return integer.slice(0, i + 1)
}

export function splitInteger(
  integer: string,
  charSet: IndexedCharacterSet
): Effect.Effect<[string, string], Error> {
  return Effect.gen(function* () {
    // We need to get the limits from the charSet
    const head = integerHead(integer, {
      firstPositive: charSet.firstPositive,
      mostPositive: charSet.mostPositive,
      firstNegative: charSet.firstNegative,
      mostNegative: charSet.mostNegative,
    })
    const tail = integer.slice(head.length)
    return [head, tail] as [string, string]
  })
}

export function incrementIntegerHead(
  head: string,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const inPositiveRange = head >= charSet.firstPositive
    const nextHead = yield* incrementKey(head, charSet)
    const headIsLimitMax = head[head.length - 1] === charSet.mostPositive
    const nextHeadIsLimitMax =
      nextHead[nextHead.length - 1] === charSet.mostPositive

    // we can not leave the head on the limit value, we have no way to know where the head ends
    if (inPositiveRange && nextHeadIsLimitMax) {
      return nextHead + charSet.mostNegative
    }
    // we are already at the limit of this level, so we need to go up a level
    if (!inPositiveRange && headIsLimitMax) {
      return head.slice(0, head.length - 1)
    }
    return nextHead
  })
}

export function decrementIntegerHead(
  head: string,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const inPositiveRange = head >= charSet.firstPositive
    const headIsLimitMin = head[head.length - 1] === charSet.mostNegative
    if (inPositiveRange && headIsLimitMin) {
      const nextLevel = head.slice(0, head.length - 1)
      // we can not leave the head on the limit value, we have no way to know where the head ends
      // so we take one extra step down
      const decremented = yield* decrementKey(nextLevel, charSet)
      return decremented
    }

    if (!inPositiveRange && headIsLimitMin) {
      return head + charSet.mostPositive
    }

    return yield* decrementKey(head, charSet)
  })
}

function startOnNewHead(
  head: string,
  limit: "upper" | "lower",
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    const newLength = yield* integerLength(head, charSet)
    const fillCharCode = limit === "upper" ? charSet.length - 1 : 0
    const fillChar = charSet.byCode[fillCharCode]
    if (fillChar === undefined) {
      return yield* Effect.fail(new Error("invalid fill character code"))
    }
    return head + fillChar.repeat(newLength - head.length)
  })
}

export function incrementInteger(
  integer: string,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    yield* validateInteger(integer, charSet)
    const [head, digs] = yield* splitInteger(integer, charSet)
    const maxChar = charSet.byCode[charSet.length - 1]
    if (maxChar === undefined) {
      return yield* Effect.fail(new Error("invalid charSet: missing max character"))
    }
    const anyNonMaxedDigit = digs
      .split("")
      .some((d) => d !== maxChar)

    // we have room to increment
    if (anyNonMaxedDigit) {
      const newDigits = yield* incrementKey(digs, charSet)
      return head + newDigits
    }
    const nextHead = yield* incrementIntegerHead(head, charSet)
    return yield* startOnNewHead(nextHead, "lower", charSet)
  })
}

export function decrementInteger(
  integer: string,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    yield* validateInteger(integer, charSet)
    const [head, digs] = yield* splitInteger(integer, charSet)
    const minChar = charSet.byCode[0]
    if (minChar === undefined) {
      return yield* Effect.fail(new Error("invalid charSet: missing min character"))
    }
    const anyNonLimitDigit = digs.split("").some((d) => d !== minChar)

    // we have room to decrement
    if (anyNonLimitDigit) {
      const newDigits = yield* decrementKey(digs, charSet)
      return head + newDigits
    }
    const nextHead = yield* decrementIntegerHead(head, charSet)
    return yield* startOnNewHead(nextHead, "upper", charSet)
  })
}

// ============================================================================
// Jittering Functions
// ============================================================================

export function jitterString(
  orderKey: string,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error, Random.Random> {
  return Effect.gen(function* () {
    const randomValue = yield* Random.next
    const shift = yield* encodeToCharSet(
      Math.floor(randomValue * charSet.jitterRange),
      charSet
    )
    return yield* addCharSetKeys(orderKey, shift, charSet)
  })
}

export function padAndJitterString(
  orderKey: string,
  numberOfChars: number,
  charSet: IndexedCharacterSet
): Effect.Effect<string, Error, Random.Random> {
  return Effect.gen(function* () {
    const paddedKey = orderKey.padEnd(
      orderKey.length + numberOfChars,
      charSet.first
    )
    return yield* jitterString(paddedKey, charSet)
  })
}

export function paddingNeededForDistance(
  distance: number,
  charSet: IndexedCharacterSet
): number {
  const gap = charSet.jitterRange - distance
  const firstBigger = Object.entries(charSet.paddingDict).find(
    ([_key, value]) => {
      return value > gap
    }
  )

  return firstBigger ? parseInt(firstBigger[0]) : 0
}

export function paddingNeededForJitter(
  orderKey: string,
  b: string | null,
  charSet: IndexedCharacterSet
): Effect.Effect<number, Error> {
  return Effect.gen(function* () {
    const integer = yield* getIntegerPart(orderKey, charSet)
    const nextInteger = yield* incrementInteger(integer, charSet)
    let needed = 0
    if (b !== null) {
      const distanceToB = yield* lexicalDistance(orderKey, b, charSet)
      if (distanceToB < charSet.jitterRange + 1) {
        needed = Math.max(needed, paddingNeededForDistance(distanceToB, charSet))
      }
    }
    const distanceToNextInteger = yield* lexicalDistance(orderKey, nextInteger, charSet)
    if (distanceToNextInteger < charSet.jitterRange + 1) {
      needed = Math.max(
        needed,
        paddingNeededForDistance(distanceToNextInteger, charSet)
      )
    }

    return needed
  })
}

// ============================================================================
// Key Generation Functions
// ============================================================================

/**
 * Generate a key between two other keys.
 * If either lower or upper is null, the key will be generated at the start or end of the list.
 */
export function generateKeyBetween(
  lower: string | null,
  upper: string | null,
  charSet: IndexedCharacterSet = base62CharSet()
): Effect.Effect<string, Error> {
  return Effect.gen(function* () {
    if (lower !== null) {
      yield* validateOrderKey(lower, charSet)
    }
    if (upper !== null) {
      yield* validateOrderKey(upper, charSet)
    }
    if (lower === null && upper === null) {
      return startKey(charSet)
    }
    if (lower === null) {
      const integer = yield* getIntegerPart(upper!, charSet)
      return yield* decrementInteger(integer, charSet)
    }
    if (upper === null) {
      const integer = yield* getIntegerPart(lower, charSet)
      return yield* incrementInteger(integer, charSet)
    }
    if (lower >= upper) {
      return yield* Effect.fail(new Error(lower + " >= " + upper))
    }
    return yield* midPoint(lower, upper, charSet)
  })
}

type GenerateKeyBetweenFunc = (
  lower: string | null,
  upper: string | null,
  charSet?: IndexedCharacterSet
) => Effect.Effect<string, Error>

type GenerateNKeysBetweenFunc = (
  lower: string | null,
  upper: string | null,
  n: number,
  charSet?: IndexedCharacterSet
) => Effect.Effect<string[], Error>

function spreadGeneratorResults(
  lower: string | null,
  upper: string | null,
  n: number,
  charSet: IndexedCharacterSet,
  generateKey: GenerateKeyBetweenFunc,
  generateNKeys: GenerateNKeysBetweenFunc
): Effect.Effect<string[], Error> {
  if (n === 0) {
    return Effect.succeed([])
  }
  if (n === 1) {
    return generateKey(lower, upper, charSet).pipe(Effect.map((key) => [key]))
  }
  if (upper == null) {
    return Effect.gen(function* () {
      let newUpper = yield* generateKey(lower, upper, charSet)
      const result = [newUpper]
      for (let i = 0; i < n - 1; i++) {
        newUpper = yield* generateKey(newUpper, upper, charSet)
        result.push(newUpper)
      }
      return result
    })
  }
  if (lower == null) {
    return Effect.gen(function* () {
      let newLower = yield* generateKey(lower, upper, charSet)
      const result = [newLower]
      for (let i = 0; i < n - 1; i++) {
        newLower = yield* generateKey(lower, newLower, charSet)
        result.push(newLower)
      }
      result.reverse()
      return result
    })
  }
  return Effect.gen(function* () {
    const mid = Math.floor(n / 2)
    const midOrderKey = yield* generateKey(lower, upper, charSet)
    const leftKeys = yield* generateNKeys(lower, midOrderKey, mid, charSet)
    const rightKeys = yield* generateNKeys(midOrderKey, upper, n - mid - 1, charSet)
    return [...leftKeys, midOrderKey, ...rightKeys]
  })
}

/**
 * Generate any number of keys between two other keys.
 * If either lower or upper is null, the keys will be generated at the start or end of the list.
 */
export function generateNKeysBetween(
  a: string | null,
  b: string | null,
  n: number,
  charSet: IndexedCharacterSet = base62CharSet()
): Effect.Effect<string[], Error> {
  return spreadGeneratorResults(
    a,
    b,
    n,
    charSet,
    (lower, upper, charSet = base62CharSet()) => generateKeyBetween(lower, upper, charSet),
    (lower, upper, n, charSet = base62CharSet()) => generateNKeysBetween(lower, upper, n, charSet)
  )
}

/**
 * Generate a key between two other keys with jitter.
 * If either lower or upper is null, the key will be generated at the start or end of the list.
 */
export function generateJitteredKeyBetween(
  lower: string | null,
  upper: string | null,
  charSet: IndexedCharacterSet = base62CharSet()
): Effect.Effect<string, Error, Random.Random> {
  return Effect.gen(function* () {
    const key = yield* generateKeyBetween(lower, upper, charSet)
    const paddingNeeded = yield* paddingNeededForJitter(key, upper, charSet)
    if (paddingNeeded) {
      return yield* padAndJitterString(key, paddingNeeded, charSet)
    }
    return yield* jitterString(key, charSet)
  })
}

/**
 * Generate any number of keys between two other keys with jitter.
 * If either lower or upper is null, the keys will be generated at the start or end of the list.
 */
export function generateNJitteredKeysBetween(
  lower: string | null,
  upper: string | null,
  n: number,
  charSet: IndexedCharacterSet = base62CharSet()
): Effect.Effect<string[], Error, Random.Random> {
  return Effect.gen(function* () {
    if (n === 0) {
      return []
    }
    if (n === 1) {
      const key = yield* generateJitteredKeyBetween(lower, upper, charSet)
      return [key]
    }
    if (upper == null) {
      let newUpper = yield* generateJitteredKeyBetween(lower, upper, charSet)
      const result = [newUpper]
      for (let i = 0; i < n - 1; i++) {
        newUpper = yield* generateJitteredKeyBetween(newUpper, upper, charSet)
        result.push(newUpper)
      }
      return result
    }
    if (lower == null) {
      let newLower = yield* generateJitteredKeyBetween(lower, upper, charSet)
      const result = [newLower]
      for (let i = 0; i < n - 1; i++) {
        newLower = yield* generateJitteredKeyBetween(lower, newLower, charSet)
        result.push(newLower)
      }
      result.reverse()
      return result
    }
    const mid = Math.floor(n / 2)
    const midOrderKey = yield* generateJitteredKeyBetween(lower, upper, charSet)
    const leftKeys = yield* generateNJitteredKeysBetween(lower, midOrderKey, mid, charSet)
    const rightKeys = yield* generateNJitteredKeysBetween(midOrderKey, upper, n - mid - 1, charSet)
    return [...leftKeys, midOrderKey, ...rightKeys]
  })
}

// ============================================================================
// Index Generator Class
// ============================================================================

export class IndexGenerator {
  private charSet: IndexedCharacterSet
  private useJitter: boolean
  private list: string[]
  private useGroups: boolean
  private groupIdLength: number

  constructor(list: string[], options: GeneratorOptions = {}) {
    this.charSet = options.charSet ?? base62CharSet()
    this.useJitter = options.useJitter ?? true
    this.list = list
    this.useGroups = !!options.groupIdLength && options.groupIdLength > 0
    this.groupIdLength = options.groupIdLength ?? 0
  }

  /**
   * Updates the list that the generator uses to generate keys.
   * The generator will not mutate the internal list when generating keys.
   */
  public updateList(list: string[]) {
    this.list = [...list].sort()
  }

  /**
   * Generate any number of keys at the start of the list (before the first key).
   * Optionally you can supply a groupId to generate keys at the start of a specific group.
   */
  public nKeysStart(n: number, groupId?: string): Effect.Effect<string[], Error, Random.Random> {
    const self = this
    return Effect.gen(function* () {
      yield* Effect.try(() => {
        self.validateGroupId(groupId)
      })
      const firstKey = self.firstOfGroup(groupId)
      return yield* self.generateNKeysBetween(null, firstKey, n, groupId)
    })
  }

  /**
   * Generate a single key at the start of the list (before the first key).
   * Optionally you can supply a groupId to generate a key at the start of a specific group.
   */
  public keyStart(groupId?: string): Effect.Effect<string, Error, Random.Random> {
    const self = this
    return Effect.gen(function* () {
      const keys = yield* self.nKeysStart(1, groupId)
      return keys[0]!
    })
  }

  /**
   * Generate any number of keys at the end of the list (after the last key).
   * Optionally you can supply a groupId to generate keys at the end of a specific group.
   */
  public nKeysEnd(n: number, groupId?: string): Effect.Effect<string[], Error, Random.Random> {
    const self = this
    return Effect.gen(function* () {
      yield* Effect.try(() => {
        self.validateGroupId(groupId)
      })
      const lastKey = self.lastOfGroup(groupId)
      return yield* self.generateNKeysBetween(lastKey, null, n, groupId)
    })
  }

  /**
   * Generate a single key at the end of the list (after the last key).
   * Optionally you can supply a groupId to generate a key at the end of a specific group.
   */
  public keyEnd(groupId?: string): Effect.Effect<string, Error, Random.Random> {
    const self = this
    return Effect.gen(function* () {
      const keys = yield* self.nKeysEnd(1, groupId)
      return keys[0]!
    })
  }

  /**
   * Generate any number of keys behind a specific key and in front of the next key.
   * GroupId will be inferred from the orderKey if working with groups
   */
  public nKeysAfter(orderKey: string, n: number): Effect.Effect<string[], Error, Random.Random> {
    const self = this
    return Effect.gen(function* () {
      const keyAfter = yield* self.getKeyAfter(orderKey)
      return yield* self.generateNKeysBetween(orderKey, keyAfter, n, self.groupId(orderKey))
    })
  }

  /**
   * Generate a single key behind a specific key and in front of the next key.
   * GroupId will be inferred from the orderKey if working with groups
   */
  public keyAfter(orderKey: string): Effect.Effect<string, Error, Random.Random> {
    const self = this
    return Effect.gen(function* () {
      const keys = yield* self.nKeysAfter(orderKey, 1)
      return keys[0]!
    })
  }

  /**
   * Generate any number of keys in front of a specific key and behind the previous key.
   * GroupId will be inferred from the orderKey if working with groups
   */
  public nKeysBefore(orderKey: string, n: number): Effect.Effect<string[], Error, Random.Random> {
    const self = this
    return Effect.gen(function* () {
      const keyBefore = yield* self.getKeyBefore(orderKey)
      return yield* self.generateNKeysBetween(keyBefore, orderKey, n, self.groupId(orderKey))
    })
  }

  /**
   * Generate a single key in front of a specific key and behind the previous key.
   * GroupId will be inferred from the orderKey if working with groups
   */
  public keyBefore(orderKey: string): Effect.Effect<string, Error, Random.Random> {
    const self = this
    return Effect.gen(function* () {
      const keys = yield* self.nKeysBefore(orderKey, 1)
      return keys[0]!
    })
  }

  /**
   * private function responsible for calling the correct generate function
   */
  private generateNKeysBetween(
    lowerKey: string | null,
    upperKey: string | null,
    n: number,
    groupId: string | undefined
  ): Effect.Effect<string[], Error, Random.Random> {
    const self = this
    const lower = self.groupLessKey(lowerKey)
    const upper = self.groupLessKey(upperKey)
    if (self.useJitter) {
      return Effect.gen(function* () {
        const keys = yield* generateNJitteredKeysBetween(lower, upper, n, self.charSet)
        return !groupId ? keys : keys.map((key) => groupId + key)
      })
    } else {
      // When not using jitter, we don't need Random, but TypeScript requires it
      // So we provide a default Random service that won't be used
      return Effect.gen(function* () {
        const keys = yield* generateNKeysBetween(lower, upper, n, self.charSet)
        return !groupId ? keys : keys.map((key) => groupId + key)
      }).pipe(Effect.provideService(Random as any, Random.make(Math.random())))
    }
  }

  /**
   * get the key before the supplied orderKey, if it exists and is in the same group
   */
  private getKeyBefore(orderKey: string): Effect.Effect<string | null, Error> {
    const index = this.list.indexOf(orderKey)
    if (index === -1) {
      return Effect.fail(new Error(`orderKey is not in the list`))
    }
    const before = this.list[index - 1]
    return Effect.succeed(!!before && this.isSameGroup(orderKey, before) ? before : null)
  }

  /**
   * get the key after the supplied orderKey, if it exists and is in the same group
   */
  private getKeyAfter(orderKey: string): Effect.Effect<string | null, Error> {
    const index = this.list.indexOf(orderKey)
    if (index === -1) {
      return Effect.fail(new Error(`orderKey is not in the list`))
    }
    const after = this.list[index + 1]
    return Effect.succeed(!!after && this.isSameGroup(orderKey, after) ? after : null)
  }

  /**
   * get the first key of the group (or the first key of the list if not using groups)
   */
  private firstOfGroup(groupId: string | undefined): string | null {
    if (!this.useGroups) return this.list[0] ?? null
    const first = this.list.find((key) => this.isPartOfGroup(key, groupId))
    return first ?? null
  }

  /**
   * get the last key of the group (or the last key of the list if not using groups)
   */
  private lastOfGroup(groupId: string | undefined): string | null {
    if (!this.useGroups) return this.list[this.list.length - 1] ?? null
    const allGroupItems = this.list.filter((key) =>
      this.isPartOfGroup(key, groupId)
    )
    const last = allGroupItems[allGroupItems.length - 1]
    return last ?? null
  }

  /**
   * throw an error if the groupId is invalid or supplied when not using groups
   */
  private validateGroupId(groupId: string | undefined): void {
    if (!this.useGroups) {
      if (groupId) {
        console.warn("groupId should not used when not using groups")
      }
      return
    }
    if (!groupId) {
      throw new Error("groupId is required when using groups")
    }
    if (groupId.length !== this.groupIdLength) {
      throw new Error(`groupId must be the lenght supplied in the options`)
    }
  }

  /**
   * get the groupId from the orderKey
   */
  private groupId(orderKey: string): string | undefined {
    if (!this.useGroups) return undefined
    return this.splitIntoGroupIdAndOrderKey(orderKey)[0]
  }

  /**
   * remove the groupId from the orderKey
   */
  private groupLessKey(orderKey: string | null): string | null {
    if (!this.useGroups) return orderKey
    return this.splitIntoGroupIdAndOrderKey(orderKey)[1]
  }

  /**
   * split the orderKey into groupId and key
   * if not using groups, orderKey will be the same as key
   */
  private splitIntoGroupIdAndOrderKey(
    orderKey: string | null
  ): [string | undefined, string | null] {
    if (!this.useGroups || !orderKey) {
      return [undefined, orderKey]
    }
    const groupId = orderKey.substring(0, this.groupIdLength)
    const key = orderKey.substring(this.groupIdLength)
    return [groupId, key]
  }

  /**
   * check if two keys are in the same group
   * if not using groups, keys will always be in the same group
   */
  private isSameGroup(a: string, b: string): boolean {
    if (!this.useGroups) return true
    const [aGroupId] = this.splitIntoGroupIdAndOrderKey(a)
    const [bGroupId] = this.splitIntoGroupIdAndOrderKey(b)
    return aGroupId === bGroupId
  }

  /**
   * check if the key is part of the group
   * if not using groups, key will always be part of the group
   */
  private isPartOfGroup(orderKey: string, groupId?: string): boolean {
    if (!this.useGroups) return true
    const [keyGroupId] = this.splitIntoGroupIdAndOrderKey(orderKey)
    return keyGroupId === groupId
  }
}
