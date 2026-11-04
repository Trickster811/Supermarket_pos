function calculateCheckDigit(firstDigits: string): string {
  let sum = 0;

  for (let i = firstDigits.length - 1, position = 0; i >= 0; i--, position++) {
    sum += Number(firstDigits[i]) * (position % 2 === 0 ? 3 : 1);
  }

  return String((10 - (sum % 10)) % 10);
}

function isValidEanOrUpc(value: string): boolean {
  return calculateCheckDigit(value.slice(0, -1)) === value.slice(-1);
}

function expandUpcE(value: string): string | null {
  if (value.length !== 8 || !/^[01]\d{6}\d$/.test(value)) {
    return null;
  }

  const numberSystem = value[0];
  const d1 = value[1];
  const d2 = value[2];
  const d3 = value[3];
  const d4 = value[4];
  const d5 = value[5];
  const d6 = value[6];
  const check = value[7];

  let upcA: string;

  if (Number(d6) <= 2) {
    upcA = `${numberSystem}${d1}${d2}${d6}0000${d3}${d4}${d5}${check}`;
  } else if (d6 === "3") {
    upcA = `${numberSystem}${d1}${d2}${d3}00000${d4}${d5}${check}`;
  } else if (d6 === "4") {
    upcA = `${numberSystem}${d1}${d2}${d3}${d4}00000${d5}${check}`;
  } else {
    upcA = `${numberSystem}${d1}${d2}${d3}${d4}${d5}0000${d6}${check}`;
  }

  return upcA;
}

export function validateBarcode(input: string): string | null {
  const value = input.trim();

  if (!value) return null;

  if (value.length > 64) {
    return "Barcode cannot exceed 64 characters.";
  }

  // EAN-8 or UPC-E
  if (/^\d{8}$/.test(value)) {
    const validEan8 = isValidEanOrUpc(value);

    const expanded = expandUpcE(value);
    const validUpcE = expanded ? isValidEanOrUpc(expanded) : false;

    if (!validEan8 && !validUpcE) {
      return "Invalid EAN-8 or UPC-E check digit.";
    }

    return null;
  }

  // UPC-A
  if (/^\d{12}$/.test(value)) {
    return isValidEanOrUpc(value) ? null : "Invalid UPC-A check digit.";
  }

  // EAN-13
  if (/^\d{13}$/.test(value)) {
    return isValidEanOrUpc(value) ? null : "Invalid EAN-13 check digit.";
  }

  // Other formats are allowed as internal/custom barcodes.
  if (!/^[A-Za-z0-9._/-]+$/.test(value)) {
    return "Barcode contains unsupported characters.";
  }

  return null;
}
