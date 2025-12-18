import { describe, it, expect, beforeAll } from "@effect/vitest"
import { Effect, Random } from "effect"
import {
  base62CharSet,
  generateJitteredKeyBetween,
  generateKeyBetween,
  generateNJitteredKeysBetween,
  generateNKeysBetween,
  indexCharacterSet,
  IndexGenerator,
} from "../src/FractionalIndex"

describe("generateKeyBetween", () => {
  const charSet = base62CharSet()
  it.effect.each([
    // a, expected, b
    [null, "a0", null],
    [null, "a0", "a1"],
    [null, "Zz", "a0"],
    [null, "b0S", "b0T"],
    ["b0S", "b0T", null],
    ["a0", "a4", "a8"],
    ["a0", "a0V", "a1"],
  ])("a:%s mid: %s b:%s", ([a, expected, b]: any) =>
    Effect.gen(function* () {
      const result = yield* generateKeyBetween(a, b, charSet)
      expect(result).toBe(expected)
    })
  )

  it("should fail if a >= b", () => Effect.gen(function* () {
    const result1 = yield* generateKeyBetween("a0", "a0", charSet).pipe(Effect.either)
    expect(result1._tag).toBe("Left")

    const result2 = yield* generateKeyBetween("a1", "a0", charSet).pipe(Effect.either)
    expect(result2._tag).toBe("Left")
  }))
})

describe("generateJitteredKeyBetween", () => {
  const charSet = base62CharSet()
  it.effect.each([
    // a, expected, b
    [null, "a06CO", null],
    [null, "a06CO", "a1"],
    [null, "Zz6CO", "a0"],
    [null, "b0S6CO", "b0T46n"],
    ["b0S", "b0T6CO", null],
    ["a0", "a46CO", "a8"],
    ["a0", "a0V6CO", "a1"],
  ])("a:%s mid: %s b:%s, should not mess up integer part", ([a, expected, b]: any) =>
    Effect.gen(function* () {
      const result = yield* generateJitteredKeyBetween(a, b, charSet).pipe(Effect.withRandomFixed([0.5])) as Effect.Effect<string, Error>
      expect(result).toBe(expected)
    })
  )
})

describe("generateNKeysBetween", () => {
  const charSet = base62CharSet()
  it('should generate 3 keys between "a0" and "a1"', () => Effect.gen(function* () {
    const keys = yield* generateNKeysBetween("a0", "a1", 3, charSet)
    expect(keys.length).toBe(3)
    expect(keys).toStrictEqual(["a0F", "a0V", "a0k"])
  }))

  it('should generate 3 keys after "b01"', () => Effect.gen(function* () {
    const keys = yield* generateNKeysBetween("b01", null, 3, charSet)
    expect(keys.length).toBe(3)
    expect(keys).toStrictEqual(["b02", "b03", "b04"])
  }))

  it('should generate 3 keys before "a0"', () => Effect.gen(function* () {
    const keys = yield* generateNKeysBetween(null, "a0", 3, charSet)
    expect(keys.length).toBe(3)
    expect(keys).toStrictEqual(["Zx", "Zy", "Zz"])
  }))
})

describe("generateNJitteredKeysBetween", () => {
  const charSet = base62CharSet()
  it('should generate 3 keys between "a0" and "a1"', () => Effect.gen(function* () {
    const keys = yield* generateNJitteredKeysBetween("a0", "a1", 3, charSet).pipe(Effect.withRandomFixed([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])) as Effect.Effect<string[], Error>
    expect(keys.length).toBe(3)
    expect(keys).toStrictEqual(["a0FeIa", "a0V6CO", "a0keIa"])
  }))
})

describe("Basic Generator", () => {
  let generator: IndexGenerator
  beforeAll(() => {
    generator = new IndexGenerator([], { useJitter: false })
  })

  it("should generate correct keys for an empty list", () => Effect.gen(function* () {
    const key1 = yield* generator.keyStart();
    expect(key1).toBe("a0")
    const key2 = yield* generator.keyEnd();
    expect(key2).toBe("a0")
    const keysStart = yield* generator.nKeysStart(2);
    expect(keysStart).toStrictEqual(["a0", "a1"])
    const keysEnd = yield* generator.nKeysEnd(2);
    expect(keysEnd).toStrictEqual(["a0", "a1"])
  }))

  it("should generate correct start keys for populated list", () => Effect.gen(function* () {
    generator.updateList(["a0"])
    const key = yield* generator.keyStart()
    const keys = yield* generator.nKeysStart(2)
    expect(key).toBe("Zz")
    expect(keys).toStrictEqual(["Zy", "Zz"])
  }))

  it("should generate correct end keys for populated list", () => Effect.gen(function* () {
    generator.updateList(["a1"])
    const key = yield* generator.keyEnd()
    const keys = yield* generator.nKeysEnd(2)
    expect(key).toBe("a2")
    expect(keys).toStrictEqual(["a2", "a3"])
  }))

  it("should generate correct keys after if last item", () => Effect.gen(function* () {
    generator.updateList(["a1"])
    const key = yield* generator.keyAfter("a1")
    const keys = yield* generator.nKeysAfter("a1", 2)
    expect(key).toBe("a2")
    expect(keys).toStrictEqual(["a2", "a3"])
  }))

  it("should generate correct keys after not last item", () => Effect.gen(function* () {
    generator.updateList(["a1", "a2"])
    const key = yield* generator.keyAfter("a1")
    const keys = yield* generator.nKeysAfter("a1", 3)
    expect(key).toBe("a1V")
    expect(keys).toStrictEqual(["a1F", "a1V", "a1k"])
  }))

  it("should generate correct keys before if first item", () => Effect.gen(function* () {
    generator.updateList(["a5"])
    const key = yield* generator.keyBefore("a5")
    const keys = yield* generator.nKeysBefore("a5", 2)
    expect(key).toBe("a4")
    expect(keys).toStrictEqual(["a3", "a4"])
  }))

  it("should generate correct keys before if not first item", () => Effect.gen(function* () {
    generator.updateList(["a1", "a2"])
    const key = yield* generator.keyBefore("a2")
    const keys = yield* generator.nKeysBefore("a2", 3)
    expect(key).toBe("a1V")
    expect(keys).toStrictEqual(["a1F", "a1V", "a1k"])
  }))
})

describe("Jittered Generator", () => {
  let generator: IndexGenerator
  beforeAll(() => {
    generator = new IndexGenerator([], { useJitter: true })
  })

  it("should generate correct jittered keys", () => Effect.gen(function* () {
    const keys = yield* generator.nKeysStart(3).pipe(Effect.withRandomFixed([0.5, 0.5, 0.5])) as Effect.Effect<string[], Error>
    expect(keys).toStrictEqual(["a06CO", "a16CO", "a26CO"])
  }))
})

describe("Group Generator", () => {
  let generator: IndexGenerator
  beforeAll(() => {
    generator = new IndexGenerator([], { useJitter: false, groupIdLength: 2 })
  })

  it("should generate correct keys for an empty list", () => Effect.gen(function* () {
    const key1 = yield* generator.keyStart("g1")
    expect(key1).toBe("g1a0")
    const key2 = yield* generator.keyEnd("g1")
    expect(key2).toBe("g1a0")
    const keysStart = yield* generator.nKeysStart(2, "g1")
    expect(keysStart).toStrictEqual(["g1a0", "g1a1"])
    const keysEnd = yield* generator.nKeysEnd(2, "g1")
    expect(keysEnd).toStrictEqual(["g1a0", "g1a1"])
  }))

  it("should fail if groupId is not supplied", () => Effect.gen(function* () {
    const result = yield* generator.keyStart().pipe(Effect.either)
    expect(result._tag).toBe("Left")
  }))

  it("should fail if groupId is incorrect length", () => Effect.gen(function* () {
    const result = yield* generator.keyStart("group1").pipe(Effect.either)
    expect(result._tag).toBe("Left")
  }))

  it("should generate correct start keys for populated list", () => Effect.gen(function* () {
    generator.updateList(["g1a0"])
    const key = yield* generator.keyStart("g1")
    const keys = yield* generator.nKeysStart(2, "g1")
    expect(key).toBe("g1Zz")
    expect(keys).toStrictEqual(["g1Zy", "g1Zz"])
  }))

  it("should generate correct end keys for populated list", () => Effect.gen(function* () {
    generator.updateList(["g1a1"])
    const key = yield* generator.keyEnd("g1")
    const keys = yield* generator.nKeysEnd(2, "g1")
    expect(key).toBe("g1a2")
    expect(keys).toStrictEqual(["g1a2", "g1a3"])
  }))

  it("should generate correct keys after if last item", () => Effect.gen(function* () {
    generator.updateList(["g1a1"])
    const key = yield* generator.keyAfter("g1a1")
    const keys = yield* generator.nKeysAfter("g1a1", 2)
    expect(key).toBe("g1a2")
    expect(keys).toStrictEqual(["g1a2", "g1a3"])
  }))

  it("should generate correct keys after not last item", () => Effect.gen(function* () {
    generator.updateList(["g1a1", "g1a2"])
    const key = yield* generator.keyAfter("g1a1")
    const keys = yield* generator.nKeysAfter("g1a1", 3)
    expect(key).toBe("g1a1V")
    expect(keys).toStrictEqual(["g1a1F", "g1a1V", "g1a1k"])
  }))

  it("should generate correct keys before if first item", () => Effect.gen(function* () {
    generator.updateList(["g1a5"])
    const key = yield* generator.keyBefore("g1a5")
    const keys = yield* generator.nKeysBefore("g1a5", 2)
    expect(key).toBe("g1a4")
    expect(keys).toStrictEqual(["g1a3", "g1a4"])
  }))

  it("should generate correct keys before if not first item", () => Effect.gen(function* () {
    generator.updateList(["g1a1", "g1a2"])
    const key = yield* generator.keyBefore("g1a2")
    const keys = yield* generator.nKeysBefore("g1a2", 3)
    expect(key).toBe("g1a1V")
    expect(keys).toStrictEqual(["g1a1F", "g1a1V", "g1a1k"])
  }))

  it("should generate correct new start key for populated list and different group", () => Effect.gen(function* () {
    generator.updateList(["g1a5"])
    const key1 = yield* generator.keyStart("g2")
    expect(key1).toBe("g2a0")
  }))
})

describe("readme examples", () => {
  it("should run generator example without errors", () => Effect.gen(function* () {
    const generator = new IndexGenerator([])

    // dummy code, would normally be stored in database or CRDT and updated from there
    const list: string[] = []
    function updateList(newKey: string) {
      list.push(newKey)
      generator.updateList(list)
    }

    const first = yield* generator.keyStart() // "a01TB" a0 with jitter
    updateList(first)

    const second = yield* generator.keyEnd() // "a10Vt" a1 with jitter
    updateList(second)

    const firstAndHalf = yield* generator.keyAfter(first) // "a0fMq" midpoint between firstKey and secondKey
    updateList(firstAndHalf)

    const firstAndQuarter = yield* generator.keyBefore(firstAndHalf) // "a0M3o" midpoint between firstKey and keyInBetween
    updateList(firstAndQuarter)

    // [ 'a01TB', 'a0M3o', 'a0fMq', 'a10Vt' ]
    // [ first, firstAndHalf, firstAndQuarter, second ]
    // console.log(list.sort())
  }))

  it("should run generator group code without errors", () => Effect.gen(function* () {
    // Jitter is disabled for this example to make the output more readable, but should be preferred in production
    const generator = new IndexGenerator([], {
      useJitter: false,
      groupIdLength: 2,
    })

    const list: string[] = []
    // dummy code, would normally be stored in database or CRDT and updated from there
    function updateList(orderKey: string) {
      list.push(orderKey)
      generator.updateList(list)
    }

    // same length as groupIdLength
    const group1 = "g1"
    const group2 = "g2"

    // "g1a0" group1 and first key
    const first = yield* generator.keyStart(group1)
    updateList(first)

    // "g1a1"  group1 and first key
    const second = yield* generator.keyEnd(group1)
    updateList(second)

    // "g1a0V" midpoint between first and second
    const firstAndAHalf = yield* generator.keyAfter(first)
    updateList(firstAndAHalf)

    // "g2a0" group2 and first key
    const firstGroup2 = yield* generator.keyStart(group2)
    updateList(firstGroup2)

    // ["g1a0", "g1a0V", "g1a1", "g2a0"]
    // [ first, firstAndAHalf, second, firstGroup2 ]
    // console.log(list.sort())
  }))

  it("should run generateJitteredKeyBetween", () => Effect.gen(function* () {
    const first = yield* generateJitteredKeyBetween(null, null).pipe(Effect.withRandomFixed([0.5])) as Effect.Effect<string, Error>
    // "a090d" (with fixed random)

    // Insert after 1st
    const second = yield* generateJitteredKeyBetween(first, null).pipe(Effect.withRandomFixed([0.5])) as Effect.Effect<string, Error>
    // "a1C1i" (with fixed random)

    // Insert after 2nd
    const third = yield* generateJitteredKeyBetween(second, null).pipe(Effect.withRandomFixed([0.5])) as Effect.Effect<string, Error>
    // "a28hy" (with fixed random)

    // Insert before 1st
    const zeroth = yield* generateJitteredKeyBetween(null, first).pipe(Effect.withRandomFixed([0.5])) as Effect.Effect<string, Error>
    // "ZzBYL" (with fixed random)

    // Insert in between 2nd and 3rd (midpoint)
    const secondAndHalf = yield* generateJitteredKeyBetween(second, third).pipe(Effect.withRandomFixed([0.5])) as Effect.Effect<string, Error>
    // "a1kek" (with fixed random)

    // console.log(first, second, third, zeroth, secondAndHalf)
  }))

  it("should run generateNJitteredKeysBetween", () => Effect.gen(function* () {
    const first = yield* generateNJitteredKeysBetween(null, null, 2).pipe(Effect.withRandomFixed([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])) as Effect.Effect<string[], Error>
    // ['a061p', 'a18Ev'] (with fixed random)

    // Insert two keys after 2nd
    yield* generateNJitteredKeysBetween(first[1]!, null, 2).pipe(Effect.withRandomFixed([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])) as Effect.Effect<string[], Error>
    // ['a23WQ', 'a315m'] (with fixed random)

    // Insert two keys before 1st
    yield* generateNJitteredKeysBetween(null, first[0]!, 2).pipe(Effect.withRandomFixed([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])) as Effect.Effect<string[], Error>
    // ['Zy6Gx', 'ZzB7s'] (with fixed random)

    // Insert two keys in between 1st and 2nd (midpoints)
    // yield* generateNJitteredKeysBetween(second, third, 2).pipe(Effect.withRandomFixed([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])) as Effect.Effect<string[], Error>
    // ['a0SIA', 'a0iDa'] (with fixed random)
  }))

  it("should run indexCharacterSet", () => Effect.gen(function* () {
    const base90Set = yield* indexCharacterSet({
      chars:
        "!#$%&()*+,./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~",
    })

    const first = yield* generateKeyBetween(null, null, base90Set) // 'Q!'

    // Insert after 1st
    const second = yield* generateKeyBetween(first, null, base90Set) // 'Q#'

    // Insert in between 2nd and 3rd (midpoint)
    const firstAndHalf = yield* generateKeyBetween(first, second, base90Set)
    // 'Q!Q'

    // Jittering is still recommended to avoid collisions
    const jitteredStart = yield* generateNJitteredKeysBetween(null, null, 2, base90Set).pipe(Effect.withRandomFixed([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5])) as Effect.Effect<string[], Error>
    // [ 'Q!$i8', 'Q#.f}' ] (with fixed random)

    // console.log(base90Set.jitterRange) // 145800 (so 3 times less likely to collide than base62)
  }))
})
