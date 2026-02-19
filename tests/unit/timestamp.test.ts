import { test, expect, describe } from "bun:test";
import {
  formatTimestamp,
  formatTimestampForFile,
  parseTimestamp,
} from "../../src/utils/timestamp.ts";

describe("formatTimestamp", () => {
  test("formats 0 as '0:00'", () => {
    expect(formatTimestamp(0)).toBe("0:00");
  });

  test("formats 65.5 as '1:05'", () => {
    expect(formatTimestamp(65.5)).toBe("1:05");
  });

  test("formats 3725 as '1:02:05'", () => {
    expect(formatTimestamp(3725)).toBe("1:02:05");
  });

  test("formats 59 as '0:59'", () => {
    expect(formatTimestamp(59)).toBe("0:59");
  });

  test("formats 60 as '1:00'", () => {
    expect(formatTimestamp(60)).toBe("1:00");
  });

  test("formats 3600 as '1:00:00'", () => {
    expect(formatTimestamp(3600)).toBe("1:00:00");
  });
});

describe("formatTimestampForFile", () => {
  test("formats 272 as '04m32s'", () => {
    expect(formatTimestampForFile(272)).toBe("04m32s");
  });

  test("formats 3735 as '1h02m15s'", () => {
    expect(formatTimestampForFile(3735)).toBe("1h02m15s");
  });

  test("formats 0 as '00m00s'", () => {
    expect(formatTimestampForFile(0)).toBe("00m00s");
  });
});

describe("parseTimestamp", () => {
  test("parses '5:00' to 300", () => {
    expect(parseTimestamp("5:00")).toBe(300);
  });

  test("parses '1:30:00' to 5400", () => {
    expect(parseTimestamp("1:30:00")).toBe(5400);
  });

  test("parses '0:30' to 30", () => {
    expect(parseTimestamp("0:30")).toBe(30);
  });

  test("parses '5:00-10:00' to range", () => {
    const result = parseTimestamp("5:00-10:00");
    expect(result).toEqual({ start: 300, end: 600 });
  });

  test("parses '1:00:00-1:30:00' to range", () => {
    const result = parseTimestamp("1:00:00-1:30:00");
    expect(result).toEqual({ start: 3600, end: 5400 });
  });

  test("throws on invalid format", () => {
    expect(() => parseTimestamp("abc")).toThrow("Invalid timestamp");
  });

  test("throws on invalid range (end before start)", () => {
    expect(() => parseTimestamp("10:00-5:00")).toThrow("end");
  });
});
