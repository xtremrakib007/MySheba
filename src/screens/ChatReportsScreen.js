// Direct Chat was removed from MySheba, so its moderation/reporting
// screen is no longer an application surface. Keep this compatibility
// entry point so stale navigation cannot reopen removed chat tooling.
export { default } from './SupportChatScreen';
