/** Picks the image provider for fresh or invalid preferences. An explicit saved provider in the list is always kept. */
export function chooseImageProvider(list, saved) {
  if (list.some(p => p.id === saved)) return saved;
  const configured = list.filter(p => p.configured);
  return (configured.find(p => p.id === 'a1111') ?? configured.find(p => p.paid === false) ?? configured[0] ?? list[0])?.id ?? '';
}
