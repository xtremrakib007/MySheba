// Legacy compatibility stub. Direct Chat was removed from MySheba.
// Support Chat lives in chatService.js.
const removed = () => () => {};
export const subscribeMyChats = removed;
export const getDirectChatMeta = async () => null;
export const ensureDirectChat = async () => null;
export const sendMessage = async () => { throw new Error('Direct Chat has been removed.'); };
export const sendMediaMessage = async () => { throw new Error('Direct Chat has been removed.'); };
export const subscribeMessages = removed;
export const markRead = async () => {};
