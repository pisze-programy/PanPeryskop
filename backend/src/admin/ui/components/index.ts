// Reusable SSR components. Each function returns an HTML string; data is escaped
// at the call site (esc()), markup lives in ui/templates/*.html.

export { pageHeader } from './pageHeader';
export { card, cardHeader, cards, statCard, type StatCardItem } from './card';
export { table, pagination, pager } from './table';
export { pill, badge } from './badge';
export { dropdown, dropdownItem, dropdownDivider } from './dropdown';
export { modal, mediaModal, alertModal, linkModal } from './modal';
export { empty } from './empty';
export { bars } from './bars';
export { filterSelect, segmented, segmentedLink, inputIconSearch, filterLabel } from './filter';
export { avatar, initialsAvatar, thumbAvatar } from './avatar';
export { alert } from './alert';
export { listGroup } from './listGroup';
export { timeline, timelineItem } from './timeline';
