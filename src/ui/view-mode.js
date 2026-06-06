export const viewModes = {
  page: "page",
  scroll: "scroll",
};

export function createPageIndexes(pageCount) {
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => index + 1);
}

export function scrollTopForPage({ pageNumber, pageHeight, gap = 0 }) {
  return Math.max(0, pageNumber - 1) * (pageHeight + gap);
}
