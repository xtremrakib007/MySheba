import PromptModal from '../components/PromptModal';
import ActionSheet from '../components/ActionSheet';
import { WALLET_FREEZE_REASONS } from '../data/rejectionReasons';
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, StyleSheet, Modal } from 'react-native';
import { showAlert } from '../utils/appAlert';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '../context/AppContext';
import { countryLabel } from '../utils/phoneCountry';
import { radius } from '../theme/theme';
import { useTheme } from "../theme/ThemeContext";
import HeaderDecor from '../components/HeaderDecor';
import {
  ROLE_PERMISSIONS,
  downgradeTargetsFor,
  setWalletFrozen,
  subscribeManageableUsers,
  subscribeUnassignedCustomers,
  createManagedUser,
  upgradeUserRole,
  downgradeUserRole,
  suspendUser,
  deleteManagedUser,
  assignDealer,
  assignReseller,
} from '../firebase/userManagementService';

const ROLE_LABEL = { customer: 'Customer', retail: 'Retail', dealer: 'Dealer', reseller: 'Reseller', support: 'Support', finance: 'Finance', admin: 'Admin', superadmin: 'Super Admin' };

// Seniority order used to figure out, per user row, which of the caller's
// canUpgradeTo roles are actually a step UP from that specific user's
// current role. dealer/dealer/reseller share a rank since none of them
// outranks the others - they're just different flavors of the same tier.
// Without this, the Upgrade button (and its role picker) would show/offer
// options based only on the caller's own permissions, ignoring whether the
// target user is already at or above that role - e.g. an admin would see
// an "Upgrade" button on a row that's already a Dealer, offering to
// "upgrade" them to Dealer again.
// support and finance sit beside dealer and reseller: staff, but not above
// an admin. `dealer` appeared twice here, which is what an unread list looks like.
const ROLE_RANK = { customer: 0, retail: 1, dealer: 1, reseller: 1, support: 1, finance: 1, admin: 2, superadmin: 3 };

/** Which of `canUpgradeTo` are a genuine promotion for this specific user -
 * i.e. strictly outrank their current role. */
function validUpgradeOptions(canUpgradeTo, targetRole) {
  const currentRank = ROLE_RANK[targetRole] ?? -1;
  return canUpgradeTo.filter((r) => (ROLE_RANK[r] ?? -1) > currentRank);
}

/**
 * A role's colour, by tier rather than by name.
 *
 * Six roles each with their own colour is a legend to memorise. Three tiers -
 * the people who buy, the staff who serve them, the people who can change the
 * system - is the distinction that actually matters when scanning a list, and
 * it survives a seventh role being added.
 */
function roleTone(role, colors) {
  if (role === 'superadmin' || role === 'admin') return colors.error;
  if (role === 'dealer' || role === 'reseller' || role === 'support' || role === 'finance') return colors.primary;
  return colors.textSecondary;
}

function RoleBadge({ role }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const tone = roleTone(role, colors);
  return (
    <View style={[styles.roleBadge, { borderColor: tone }]}>
      <Text style={[styles.roleBadgeText, { color: tone }]}>{ROLE_LABEL[role] || role}</Text>
    </View>
  );
}

/** The one or two letters that stand in for a face. */
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * One account, as a row.
 *
 * At module scope on purpose. This was declared inside UserManagementScreen's
 * body, which makes it a NEW component type on every render - so React threw
 * away and rebuilt every row in the list on each keystroke in the search box,
 * which is exactly when the list is longest and the typing most deserves to
 * feel smooth.
 *
 * The actions are one button, not six. They used to be a wrapping row of small
 * pills in the corner, where Delete ended up the same size as Upgrade and a
 * thumb's width from it.
 */
function UserCard({ u, onManage, actionCount, manageLabel = 'Manage' }) {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const tone = roleTone(u.role, colors);
  const meta = [u.phone || '—', u.userId ? `ID ${u.userId}` : '', countryLabel(u)].filter(Boolean).join(' · ');
  return (
    <View style={styles.userCard}>
      <View style={[styles.avatar, { borderColor: tone }]}>
        <Text style={[styles.avatarText, { color: tone }]}>{initialsOf(u.name)}</Text>
      </View>
      <View style={styles.userMain}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName} numberOfLines={1}>{u.name || '—'}</Text>
          <RoleBadge role={u.role} />
        </View>
        <Text style={styles.userPhone} numberOfLines={1}>{meta}</Text>
        {(!!u.suspended || !!u.walletFrozen) && (
          <View style={styles.badgeRow}>
            {!!u.suspended && <View style={styles.suspendedBadge}><Text style={styles.suspendedBadgeText}>Suspended</Text></View>}
            {!!u.walletFrozen && <View style={styles.frozenBadge}><Text style={styles.frozenBadgeText}>Wallet frozen</Text></View>}
          </View>
        )}
      </View>
      {/* Hidden rather than disabled when there is nothing to do: a dealer
          looking at their own customers can act on none of them, and a column
          of dead buttons says less than no column at all. */}
      {actionCount > 0 && (
        <TouchableOpacity style={styles.manageBtn} onPress={() => onManage(u)} accessibilityRole="button" accessibilityLabel={`${manageLabel}, ${u.name || 'account'}`}>
          <Text style={styles.manageBtnText}>{manageLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const normalizeDigits = (v) => String(v || '').replace(/[^0-9]/g, '');

// Matches the search box against name (substring, case-insensitive), phone,
// and numeric userId (digit-only substring on both, so partial phone/ID
// fragments still find someone).
function matchesSearch(u, term) {
  if (!term) return true;
  const nameLower = String(u.name || '').toLowerCase();
  const termLower = term.toLowerCase();
  const termDigits = normalizeDigits(term);
  const nameMatch = nameLower.includes(termLower);
  const phoneMatch = termDigits.length > 0 && normalizeDigits(u.phone).includes(termDigits);
  const idMatch = termDigits.length > 0 && String(u.userId || '').includes(termDigits);
  return nameMatch || phoneMatch || idMatch;
}

// Each section starts collapsed and expands on tap of its header - keeps a
// long combined user list scannable instead of one continuous scroll.
// While a search is active, sections auto-expand so matches aren't hidden
// behind a collapsed header; collapse state resumes once the search clears.
function Section({ title, count, expanded, onToggle, children, emptyText, isEmpty }) {
  const {
    colors
  } = useTheme();

  const styles = createStyles(colors);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={onToggle} activeOpacity={0.7}>
        <Text style={styles.sectionTitle}>{title} ({count})</Text>
        <Text style={styles.sectionChevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {expanded && (isEmpty ? <Text style={styles.emptyText}>{emptyText}</Text> : children)}
    </View>
  );
}

export default function UserManagementScreen() {
  const {
    colors,
    brandGradient
  } = useTheme();

  const styles = createStyles(colors);
  const { goBackOrHome, profile, authUser } = useApp();
  const myRole = profile?.role;
  const perms = ROLE_PERMISSIONS[myRole] || { canCreate: [], canUpgradeTo: [] };
  const downgradeOptionsFor = (role) => downgradeTargetsFor(myRole, role);
  const isAdminTier = myRole === 'admin' || myRole === 'superadmin';
  const isSuperadmin = myRole === 'superadmin';
  // Same scoping AppContext uses for the dealer transaction feed: a dealer's
  // scope is their own uid, a dealer's is their parent dealer's uid.
  const dealerScope = myRole === 'dealer' ? authUser?.uid : profile?.dealerId;

  const [users, setUsers] = useState([]);
  const [unassigned, setUnassigned] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState(null); // user object
  const [downgradeTarget, setDowngradeTarget] = useState(null); // user object
  const [freezeTarget, setFreezeTarget] = useState(null); // user object
  const [manageTarget, setManageTarget] = useState(null); // user whose action sheet is open
  const [assignTarget, setAssignTarget] = useState(null); // customer with no dealer
  const [resellerAssignTarget, setResellerAssignTarget] = useState(null); // customer being (re)assigned a reseller
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [newRole, setNewRole] = useState(perms.canCreate[0] || 'customer');
  const [assignedDealerId, setAssignedDealerId] = useState(null);
  const [assignedResellerId, setAssignedResellerId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expanded, setExpanded] = useState({ unassigned: false, admins: false, dealers: false, resellers: false, customers: false });
  const toggleSection = (key) => setExpanded((e) => ({ ...e, [key]: !e[key] }));
  const isSearching = searchTerm.trim().length > 0;
  const isExpanded = (key) => isSearching || expanded[key];

  useEffect(() => {
    if (!isAdminTier && !dealerScope) return undefined; // dealer profile not loaded yet
    const unsub = subscribeManageableUsers(myRole, dealerScope, setUsers, () => {});
    return unsub;
  }, [myRole, dealerScope, isAdminTier]);

  // Customers who self-registered without a dealer code - only admin/superadmin
  // can pick one up and assign a dealer (see assignDealer / manageUser's
  // 'setDealer' action). These never show up in `users` above, since that
  // list is dealers/admins only for this tier.
  useEffect(() => {
    if (!isAdminTier) return undefined;
    const unsub = subscribeUnassignedCustomers(setUnassigned, () => {});
    return unsub;
  }, [isAdminTier]);

  // Admin/superadmin creating a 'customer' account must say which dealer
  // it belongs to - every customer needs a dealer, and admins aren't
  // attached to one themselves. Built from the same user list they can
  // already see.
  const dealerOptions = users.filter((u) => u.role === 'dealer');
  // Same "who could this customer be assigned to" list as dealerOptions,
  // just for the reseller step in front of the dealer queue - see
  // transactionService's resellerId/dealerId handling.
  const resellerOptions = users.filter((u) => u.role === 'reseller');

  const resetCreateForm = () => {
    setName(''); setPhone(''); setPin(''); setNewRole(perms.canCreate[0] || 'customer'); setAssignedDealerId(null); setAssignedResellerId(null);
  };

  const onCreate = async () => {
    setBusy(true);
    try {
      await createManagedUser({ name, phone, pin, role: newRole, dealerId: assignedDealerId, resellerId: assignedResellerId });
      showAlert('MySheba', `${ROLE_LABEL[newRole] || newRole} account created.`);
      setCreateOpen(false);
      resetCreateForm();
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not create account.');
    } finally {
      setBusy(false);
    }
  };

  const onUpgrade = async (role) => {
    if (!upgradeTarget) return;
    setBusy(true);
    try {
      await upgradeUserRole({ targetUid: upgradeTarget.id, newRole: role });
      showAlert('MySheba', `${upgradeTarget.name || 'User'} is now a ${ROLE_LABEL[role] || role}.`);
      setUpgradeTarget(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not update role.');
    } finally {
      setBusy(false);
    }
  };

  const onAssignDealer = async (dealerId) => {
    if (!assignTarget) return;
    setBusy(true);
    try {
      await assignDealer({ targetUid: assignTarget.id, dealerId });
      showAlert('MySheba', `${assignTarget.name || 'This customer'} has been assigned to a dealer.`);
      setAssignTarget(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not assign a dealer.');
    } finally {
      setBusy(false);
    }
  };

  const onAssignReseller = async (resellerId) => {
    if (!resellerAssignTarget) return;
    setBusy(true);
    try {
      await assignReseller({ targetUid: resellerAssignTarget.id, resellerId });
      showAlert('MySheba', `${resellerAssignTarget.name || 'This customer'} has been assigned to a reseller.`);
      setResellerAssignTarget(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not assign a reseller.');
    } finally {
      setBusy(false);
    }
  };

  // A downgrade used to be one fixed outcome, so a confirmation was the whole
  // interaction. There is a choice now, so it opens a picker like Upgrade
  // does - and the role is sent rather than recomputed on the server.
  const onDowngrade = (u) => setDowngradeTarget(u);

  const applyDowngrade = async (role) => {
    if (!downgradeTarget) return;
    setBusy(true);
    try {
      await downgradeUserRole({ targetUid: downgradeTarget.id, newRole: role });
      showAlert('MySheba', `${downgradeTarget.name || 'User'} is now a ${ROLE_LABEL[role] || role}.`);
      setDowngradeTarget(null);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not downgrade this user.');
    } finally {
      setBusy(false);
    }
  };

  // Support can freeze, which is the point: a customer reaching support about
  // a wallet draining should not wait for a superadmin to come online.
  const canFreeze = myRole === 'support' || myRole === 'superadmin';

  const onToggleFreeze = (u) => {
    if (u.walletFrozen) {
      showAlert(`Unfreeze ${u.name || 'this wallet'}?`, 'They will be able to spend and transfer again.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfreeze',
          onPress: async () => {
            setBusy(true);
            try {
              await setWalletFrozen({ targetUid: u.id, frozen: false });
              showAlert('MySheba', `${u.name || 'That'} wallet is active again.`);
            } catch (err) {
              showAlert('MySheba', err.message || 'Could not unfreeze this wallet.');
            } finally { setBusy(false); }
          },
        },
      ]);
      return;
    }
    setFreezeTarget(u);
  };

  const confirmFreeze = async (reason) => {
    const u = freezeTarget;
    setFreezeTarget(null);
    if (!u || !String(reason || '').trim()) return;
    setBusy(true);
    try {
      await setWalletFrozen({ targetUid: u.id, frozen: true, reason });
      showAlert('MySheba', `${u.name || 'That'} wallet is frozen. They can sign in and see it, but cannot move money.`);
    } catch (err) {
      showAlert('MySheba', err.message || 'Could not freeze this wallet.');
    } finally { setBusy(false); }
  };

  const onToggleSuspend = (u) => {
    const suspending = !u.suspended;
    showAlert(
      suspending ? `Suspend ${u.name || 'this user'}?` : `Reactivate ${u.name || 'this user'}?`,
      suspending
        ? 'They will not be able to sign in until reactivated.'
        : 'They will be able to sign in again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: suspending ? 'Suspend' : 'Reactivate',
          style: suspending ? 'destructive' : 'default',
          onPress: async () => {
            setBusy(true);
            try {
              await suspendUser({ targetUid: u.id, suspended: suspending });
              showAlert('MySheba', suspending ? `${u.name || 'User'} has been suspended.` : `${u.name || 'User'} has been reactivated.`);
            } catch (err) {
              showAlert('MySheba', err.message || 'Could not update this account.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  const onDeleteUser = (u) => {
    showAlert(`Delete ${u.name || 'this user'}?`, 'This permanently removes their account and cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteManagedUser({ targetUid: u.id });
            showAlert('MySheba', `${u.name || 'The account'} has been deleted.`);
          } catch (err) {
            showAlert('MySheba', err.message || 'Could not delete this account.');
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  // Only show accounts this role has any reason to touch: everyone below
  // their own tier, so there's something to upgrade or just review.
  const visibleUsers = users.filter((u) => u.id !== profile?.uid);

  // For admin/superadmin, split the flat list into role sections so it
  // reads as "Admins / Dealers / Customers" (superadmin) or "Dealers /
  // Customers" (admin) instead of one long mixed list. Dealer/dealer
  // keep the single scoped list they already had - it's just their own
  // customer pool, nothing to split.
  const term = searchTerm.trim();
  const adminList = visibleUsers.filter((u) => u.role === 'admin' && matchesSearch(u, term));
  const dealerList = visibleUsers.filter((u) => u.role === 'dealer' && matchesSearch(u, term));
  const resellerList = visibleUsers.filter((u) => u.role === 'reseller' && matchesSearch(u, term));
  // Without a section of their own, a support or finance account appeared in
  // no list at all - created, and then invisible to the person who created it.
  const staffList = visibleUsers.filter((u) => (u.role === 'support' || u.role === 'finance') && matchesSearch(u, term));
  const customerList = visibleUsers.filter((u) => u.role === 'customer' && matchesSearch(u, term));
  const filteredVisibleUsers = visibleUsers.filter((u) => matchesSearch(u, term));
  const filteredUnassigned = unassigned.filter((u) => matchesSearch(u, term));
  // "Accounts you can see" - includes yourself, since the total should read
  // as "how many exist in my scope", not just "how many I can manage".
  // For dealer/dealer this is their own pool; for admin/superadmin it's
  // admin+dealer+customer+unassigned (dealers aren't in this particular
  // scoped query - see subscribeAllUsers in userManagementService.js for a
  // true platform-wide total, used instead on the Activity Logs screen).
  const totalVisibleCount = visibleUsers.length + unassigned.length + 1;

  /**
   * Everything this caller may do to that account, as action-sheet rows.
   *
   * One list, built once per user, used both to render the sheet and to decide
   * whether the Manage button appears at all - so a button that opens an empty
   * sheet is not a state that can exist.
   *
   * Each guard mirrors a server-side one in functions/userManagement.js. They
   * are not the security boundary; the server is. They are here so a person is
   * not offered an action that can only come back as a permission error.
   */
  const actionsFor = (u) => {
    const upgradeOptions = validUpgradeOptions(perms.canUpgradeTo, u.role);
    // Suspend/Delete are superadmin-only, and a superadmin account is never a
    // valid target.
    const canModerate = isSuperadmin && u.role !== 'superadmin';
    // Admin/superadmin can (re)assign which reseller a customer's orders route
    // to, any time - a customer can already have a dealer and still get one.
    const canSetReseller = isAdminTier && u.role === 'customer';
    return [
      upgradeOptions.length > 0 && {
        key: 'upgrade', label: 'Upgrade role', tone: 'primary',
        description: `Promote to ${upgradeOptions.map((r) => ROLE_LABEL[r] || r).join(' or ')}`,
        onPress: () => setUpgradeTarget(u),
      },
      downgradeOptionsFor(u.role).length > 0 && {
        key: 'downgrade', label: 'Downgrade role',
        description: `Move down to ${downgradeOptionsFor(u.role).map((r) => ROLE_LABEL[r] || r).join(' or ')}`,
        onPress: () => onDowngrade(u),
      },
      canSetReseller && {
        key: 'reseller', label: u.resellerId ? 'Change reseller' : 'Set reseller',
        description: 'Which reseller this customer\u2019s orders route to first',
        onPress: () => setResellerAssignTarget(u),
      },
      canFreeze && {
        key: 'freeze',
        label: u.walletFrozen ? 'Unfreeze wallet' : 'Freeze wallet',
        description: u.walletFrozen
          ? 'Let this account spend and transfer again'
          : 'Stop this account spending while something is looked into',
        tone: u.walletFrozen ? 'default' : 'danger',
        onPress: () => onToggleFreeze(u),
      },
      canModerate && {
        key: 'suspend',
        label: u.suspended ? 'Reactivate account' : 'Suspend account',
        description: u.suspended ? 'Let them sign in again' : 'Block sign-in without deleting anything',
        tone: u.suspended ? 'default' : 'danger',
        onPress: () => onToggleSuspend(u),
      },
      canModerate && {
        key: 'delete', label: 'Delete account', tone: 'danger',
        description: 'Permanent. Their history and wallet go with it.',
        onPress: () => onDeleteUser(u),
      },
    ].filter(Boolean);
  };

  const manageActions = manageTarget ? actionsFor(manageTarget) : [];

  return (
    <View style={styles.screen}>
      <LinearGradient colors={brandGradient } start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.header}>
        <HeaderDecor />
        <TouchableOpacity style={styles.backBtn} onPress={goBackOrHome}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Management</Text>
      </LinearGradient>

      <View style={styles.totalRow}>
        <Text style={styles.totalRowText}>👥 {totalVisibleCount} account{totalVisibleCount === 1 ? '' : 's'}</Text>
      </View>

      {perms.canCreate.length > 0 && (
        <TouchableOpacity style={styles.createBtn} onPress={() => { resetCreateForm(); setCreateOpen(true); }}>
          <Text style={styles.createBtnText}>+ Create Account</Text>
        </TouchableOpacity>
      )}

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search by name, phone, or user ID"
          placeholderTextColor={colors.placeholder}
        />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: 30 }}>
        {!!(isAdminTier && unassigned.length > 0) && (
          <Section
            title="Users Not Under Any Dealer"
            count={filteredUnassigned.length}
            expanded={isExpanded('unassigned')}
            onToggle={() => toggleSection('unassigned')}
            isEmpty={filteredUnassigned.length === 0}
            emptyText="No matches in this section."
          >
            {filteredUnassigned.map((u) => (
              <UserCard
                key={u.id}
                u={u}
                actionCount={1}
                manageLabel="Assign dealer"
                onManage={setAssignTarget}
              />
            ))}
          </Section>
        )}

        {isAdminTier ? (
          <>
            {myRole === 'superadmin' && (
              <Section
                title="Admins"
                count={adminList.length}
                expanded={isExpanded('admins')}
                onToggle={() => toggleSection('admins')}
                isEmpty={adminList.length === 0}
                emptyText={isSearching ? 'No matches in this section.' : 'No admins yet.'}
              >
                {adminList.map((u) => <UserCard key={u.id} u={u} onManage={setManageTarget} actionCount={actionsFor(u).length} />)}
              </Section>
            )}

            <Section
              title="Dealers"
              count={dealerList.length}
              expanded={isExpanded('dealers')}
              onToggle={() => toggleSection('dealers')}
              isEmpty={dealerList.length === 0}
              emptyText={isSearching ? 'No matches in this section.' : 'No dealers yet.'}
            >
              {dealerList.map((u) => <UserCard key={u.id} u={u} onManage={setManageTarget} actionCount={actionsFor(u).length} />)}
            </Section>

            <Section
              title="Resellers"
              count={resellerList.length}
              expanded={isExpanded('resellers')}
              onToggle={() => toggleSection('resellers')}
              isEmpty={resellerList.length === 0}
              emptyText={isSearching ? 'No matches in this section.' : 'No resellers yet.'}
            >
              {resellerList.map((u) => <UserCard key={u.id} u={u} onManage={setManageTarget} actionCount={actionsFor(u).length} />)}
            </Section>

            <Section
              title="Support &amp; Finance"
              count={staffList.length}
              expanded={isExpanded('staff')}
              onToggle={() => toggleSection('staff')}
              isEmpty={staffList.length === 0}
              emptyText={isSearching ? 'No matches in this section.' : 'No support or finance agents yet.'}
            >
              {staffList.map((u) => <UserCard key={u.id} u={u} onManage={setManageTarget} actionCount={actionsFor(u).length} />)}
            </Section>

            <Section
              title="Customers"
              count={customerList.length}
              expanded={isExpanded('customers')}
              onToggle={() => toggleSection('customers')}
              isEmpty={customerList.length === 0}
              emptyText={isSearching ? 'No matches in this section.' : 'No customers yet.'}
            >
              {customerList.map((u) => <UserCard key={u.id} u={u} onManage={setManageTarget} actionCount={actionsFor(u).length} />)}
            </Section>
          </>
        ) : (
          <Section
            title="Customers"
            count={filteredVisibleUsers.length}
            expanded={isExpanded('customers')}
            onToggle={() => toggleSection('customers')}
            isEmpty={filteredVisibleUsers.length === 0}
            emptyText={isSearching ? 'No matches in this section.' : 'No users found yet.'}
          >
            {filteredVisibleUsers.map((u) => <UserCard key={u.id} u={u} onManage={setManageTarget} actionCount={actionsFor(u).length} />)}
          </Section>
        )}
      </ScrollView>

      {/* Create account modal */}
      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Account</Text>
            <TextInput style={styles.input} placeholder="Full name" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <TextInput style={styles.input} placeholder="Password (6-20 characters)" value={pin} onChangeText={setPin} autoCapitalize="none" secureTextEntry />
            <Text style={styles.modalLabel}>Account type</Text>
            <View style={styles.roleRow}>
              {perms.canCreate.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleChip, newRole === r && styles.roleChipActive]}
                  onPress={() => setNewRole(r)}
                >
                  <Text style={[styles.roleChipText, newRole === r && styles.roleChipTextActive]}>
                    {ROLE_LABEL[r] || r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {!!(isAdminTier && newRole === 'customer') && (
              <>
                <Text style={styles.modalLabel}>Assign to dealer (optional)</Text>
                <View style={styles.roleRow}>
                  {dealerOptions.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.roleChip, assignedDealerId === d.id && styles.roleChipActive]}
                      onPress={() => setAssignedDealerId(d.id)}
                    >
                      <Text style={[styles.roleChipText, assignedDealerId === d.id && styles.roleChipTextActive]}>
                        {d.name || d.phone}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {dealerOptions.length === 0 && <Text style={styles.emptyText}>No dealers yet.</Text>}
                </View>
                <Text style={styles.modalLabel}>Assign to reseller (optional)</Text>
                <View style={styles.roleRow}>
                  {resellerOptions.map((r) => (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.roleChip, assignedResellerId === r.id && styles.roleChipActive]}
                      onPress={() => setAssignedResellerId(r.id)}
                    >
                      <Text style={[styles.roleChipText, assignedResellerId === r.id && styles.roleChipTextActive]}>
                        {r.name || r.phone}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {resellerOptions.length === 0 && <Text style={styles.emptyText}>No resellers yet.</Text>}
                </View>
              </>
            )}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setCreateOpen(false)} disabled={busy}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={onCreate} disabled={busy}>
                <Text style={styles.modalConfirmText}>{busy ? 'Creating…' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Upgrade role modal */}
      <Modal visible={!!upgradeTarget} transparent animationType="fade" onRequestClose={() => setUpgradeTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Upgrade {upgradeTarget?.name || 'User'}</Text>
            <Text style={styles.modalLabel}>Currently: {ROLE_LABEL[upgradeTarget?.role] || upgradeTarget?.role}</Text>
            <View style={styles.roleRow}>
              {validUpgradeOptions(perms.canUpgradeTo, upgradeTarget?.role).map((r) => (
                <TouchableOpacity key={r} style={styles.roleChip} onPress={() => onUpgrade(r)} disabled={busy}>
                  <Text style={styles.roleChipText}>{ROLE_LABEL[r] || r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setUpgradeTarget(null)} disabled={busy}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ActionSheet
        visible={!!manageTarget}
        title={manageTarget?.name || 'Account'}
        subtitle={manageTarget ? `${ROLE_LABEL[manageTarget.role] || manageTarget.role} · ${manageTarget.phone || 'no phone'}` : ''}
        actions={manageActions}
        onClose={() => setManageTarget(null)}
      />

      <PromptModal
        visible={!!freezeTarget}
        title={`Freeze ${freezeTarget?.name || 'this wallet'} - reason:`}
        placeholder="Why is this wallet being held?"
        suggestions={WALLET_FREEZE_REASONS}
        onSubmit={confirmFreeze}
        onCancel={() => setFreezeTarget(null)}
      />

      {/* Downgrade role modal - the same shape as Upgrade, because the
          decision is now the same kind of decision. */}
      <Modal visible={!!downgradeTarget} transparent animationType="fade" onRequestClose={() => setDowngradeTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Downgrade {downgradeTarget?.name || 'User'}</Text>
            <Text style={styles.modalLabel}>Currently: {ROLE_LABEL[downgradeTarget?.role] || downgradeTarget?.role}</Text>
            <View style={styles.roleRow}>
              {downgradeOptionsFor(downgradeTarget?.role).map((r) => (
                <TouchableOpacity key={r} style={styles.roleChip} onPress={() => applyDowngrade(r)} disabled={busy}>
                  <Text style={styles.roleChipText}>{ROLE_LABEL[r] || r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setDowngradeTarget(null)} disabled={busy}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Assign dealer modal (for unassigned customers) */}
      <Modal visible={!!assignTarget} transparent animationType="fade" onRequestClose={() => setAssignTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign {assignTarget?.name || 'Customer'} to a dealer</Text>
            <View style={styles.roleRow}>
              {dealerOptions.map((d) => (
                <TouchableOpacity key={d.id} style={styles.roleChip} onPress={() => onAssignDealer(d.id)} disabled={busy}>
                  <Text style={styles.roleChipText}>{d.name || d.phone}</Text>
                </TouchableOpacity>
              ))}
              {dealerOptions.length === 0 && <Text style={styles.emptyText}>No dealers yet.</Text>}
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setAssignTarget(null)} disabled={busy}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Assign reseller modal - which reseller a customer's dealer-queue
          orders route to first; see the isReseller() branch on
          transactions/{id} in firestore.rules. */}
      <Modal visible={!!resellerAssignTarget} transparent animationType="fade" onRequestClose={() => setResellerAssignTarget(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign {resellerAssignTarget?.name || 'Customer'} to a reseller</Text>
            <View style={styles.roleRow}>
              {resellerOptions.map((r) => (
                <TouchableOpacity key={r.id} style={styles.roleChip} onPress={() => onAssignReseller(r.id)} disabled={busy}>
                  <Text style={styles.roleChipText}>{r.name || r.phone}</Text>
                </TouchableOpacity>
              ))}
              {resellerOptions.length === 0 && <Text style={styles.emptyText}>No resellers yet.</Text>}
            </View>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setResellerAssignTarget(null)} disabled={busy}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.primary , overflow: 'hidden' },
    backBtn: { padding: 4 },
    backText: { color: 'white', fontSize: 20 },
    headerTitle: { color: 'white', fontWeight: '600', fontSize: 16, marginLeft: 10 },
    totalRow: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.border },
    totalRowText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.2 },
    createBtn: { backgroundColor: colors.primary, margin: 16, marginBottom: 0, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' },
    createBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
    searchRow: { paddingHorizontal: 16, paddingTop: 12 },
    searchInput: {
      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill,
      paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: colors.text,
    },
    section: { marginBottom: 4 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    sectionChevron: { fontSize: 11, color: colors.textSecondary },
    sectionTitle: { fontSize: 11.5, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
    userCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10, gap: 11 },
    avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
    avatarText: { fontSize: 13.5, fontWeight: '800' },
    userMain: { flex: 1, minWidth: 0 },
    userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    userName: { fontSize: 14.5, fontWeight: '700', color: colors.text, flexShrink: 1 },
    userPhone: { fontSize: 11.5, color: colors.textSecondary, marginTop: 3 },
    badgeRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
    manageBtn: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.primary },
    manageBtnText: { fontSize: 11.5, fontWeight: '800', color: colors.primary },
    roleBadge: { borderRadius: radius.pill, borderWidth: 1, paddingVertical: 2, paddingHorizontal: 8 },
    roleBadgeText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.3 },
    suspendedBadge: { borderWidth: 1, borderColor: colors.error, borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: 8 },
    frozenBadge: { borderWidth: 1, borderColor: colors.secondary, borderRadius: radius.pill, paddingVertical: 2, paddingHorizontal: 8 },
    frozenBadgeText: { color: colors.secondary, fontSize: 10, fontWeight: '800' },
    suspendedBadgeText: { color: colors.error, fontSize: 10, fontWeight: '800' },
    emptyText: { textAlign: 'center', color: colors.textSecondary, fontSize: 12.5, paddingVertical: 18 },
    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
    modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 20 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 12 },
    modalLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
    input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 10, fontSize: 13 },
    roleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    roleChip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 14 },
    roleChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    roleChipText: { fontSize: 12, fontWeight: '600', color: colors.text },
    roleChipTextActive: { color: 'white' },
    modalActions: { flexDirection: 'row', gap: 10 },
    modalCancel: { flex: 1, alignItems: 'center', paddingVertical: 10 },
    modalCancelText: { color: colors.textSecondary, fontWeight: '700' },
    modalConfirm: { flex: 1, backgroundColor: colors.primary, borderRadius: radius.md, alignItems: 'center', paddingVertical: 10 },
    modalConfirmText: { color: 'white', fontWeight: '700' },
  });
}
