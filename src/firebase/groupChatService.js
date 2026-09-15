// Legacy compatibility stub. Group Chat was removed from MySheba.
const removed = () => () => {};
export const subscribeMyGroups = removed;
export const getGroupMeta = async () => null;
export const subscribeGroupMeta = removed;
export const subscribeGroupMessages = removed;
export const markGroupRead = async () => {};
export const createGroup = async () => { throw new Error('Group Chat removed.'); };
