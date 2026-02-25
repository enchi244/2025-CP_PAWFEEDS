import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDocs, limit, query, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions'; // Import httpsCallable
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Modal,
    SafeAreaView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { auth, db, functions } from '../../firebaseConfig'; // Import functions

const COLORS = {
  primary: '#2C3E50',
  background: '#ECF0F1',
  white: '#FFFFFF',
  text: '#34495E',
  accent: '#E74C3C',
  success: '#27AE60',
  warning: '#F39C12',
  info: '#3498DB',
  lightGray: '#BDC3C7'
};

interface UserData {
  id: string;
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
  createdAt?: any;
}

export default function UserManagerScreen() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAdmin, setFilterAdmin] = useState<'All' | 'Admins' | 'Users'>('All');

  const [selectedUser, setSelectedUser] = useState<UserData | null>(null);
  const [isEditModalVisible, setEditModalVisible] = useState(false);
  const [isCreateModalVisible, setCreateModalVisible] = useState(false); // New State

  // Edit Form State
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editEmail, setEditEmail] = useState('');

  // Create Form State
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, limit(100)); 
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as UserData));
      setUsers(data);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Error', 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // --- CREATE USER HANDLER ---
  const handleCreateUser = async () => {
    if (!newFirstName || !newLastName || !newEmail || !newPassword) {
        Alert.alert("Validation", "All fields are required.");
        return;
    }
    if (newPassword.length < 6) {
        Alert.alert("Validation", "Password must be at least 6 characters.");
        return;
    }

    setLoading(true);
    try {
        // Call Cloud Function
        const createUserFn = httpsCallable(functions, 'createUserAccount');
        const result = await createUserFn({
            firstName: newFirstName,
            lastName: newLastName,
            email: newEmail,
            password: newPassword
        });
        
        // @ts-ignore
        if (result.data && result.data.status === 'success') {
            Alert.alert("Success", `User ${newEmail} created successfully.`);
            setCreateModalVisible(false);
            // Clear Form
            setNewFirstName(''); setNewLastName(''); setNewEmail(''); setNewPassword('');
            // Refresh List
            fetchUsers();
        }
    } catch (error: any) {
        console.error("Create user error:", error);
        Alert.alert("Error", error.message || "Failed to create user.");
    } finally {
        setLoading(false);
    }
  };

  // --- EXISTING HANDLERS (Edit, Delete, etc.) ---
  const openEditModal = () => {
    if (!selectedUser) return;
    setEditFirstName(selectedUser.firstName || '');
    setEditLastName(selectedUser.lastName || '');
    setEditEmail(selectedUser.email || '');
    setEditModalVisible(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser) return;
    if (!editFirstName || !editLastName || !editEmail) {
        Alert.alert("Validation", "All fields are required.");
        return;
    }

    setLoading(true);
    try {
        const userRef = doc(db, 'users', selectedUser.uid);
        await updateDoc(userRef, {
            firstName: editFirstName,
            lastName: editLastName,
            email: editEmail
        });

        setUsers(prev => prev.map(u => 
            u.uid === selectedUser.uid ? { ...u, firstName: editFirstName, lastName: editLastName, email: editEmail } : u
        ));
        
        Alert.alert("Success", "User profile updated.");
        setEditModalVisible(false);
        setSelectedUser(null);
    } catch (error) {
        Alert.alert("Error", "Could not update user.");
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    if (selectedUser.uid === auth.currentUser?.uid) {
        Alert.alert("Action Blocked", "You cannot delete your own account.");
        return;
    }

    Alert.alert(
        "Delete User",
        `Delete ${selectedUser.email}? Data will be removed.`,
        [
            { text: "Cancel", style: "cancel" },
            { 
                text: "Delete", 
                style: "destructive",
                onPress: async () => {
                    try {
                        await deleteDoc(doc(db, 'users', selectedUser.uid));
                        setUsers(prev => prev.filter(u => u.uid !== selectedUser.uid));
                        setSelectedUser(null);
                    } catch (err) {
                        Alert.alert("Error", "Failed to delete user data.");
                    }
                }
            }
        ]
    );
  };

  const handleToggleAdmin = async () => {
    if (!selectedUser) return;
    if (selectedUser.uid === auth.currentUser?.uid) {
      Alert.alert("Action Blocked", "You cannot revoke your own admin status.");
      return;
    }
    const newStatus = !selectedUser.isAdmin;
    Alert.alert(
      "Confirm Role Change",
      `Change ${selectedUser.firstName}'s role?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              await updateDoc(doc(db, 'users', selectedUser.uid), { isAdmin: newStatus });
              setUsers(prev => prev.map(u => u.uid === selectedUser.uid ? { ...u, isAdmin: newStatus } : u));
              setSelectedUser(null);
            } catch (error) {
              Alert.alert("Error", "Could not update user role.");
            }
          }
        }
      ]
    );
  };

  const handleInspectDevices = () => {
    if (!selectedUser) return;
    const emailToSearch = selectedUser.email;
    setSelectedUser(null);
    router.push({
      pathname: '/admin/device-inspector',
      params: { search: emailToSearch }
    });
  };

  const filteredUsers = users.filter(u => {
    const fullName = `${u.firstName} ${u.lastName}`.toLowerCase();
    const matchesSearch = fullName.includes(search.toLowerCase()) || u.email.includes(search.toLowerCase());
    let matchesFilter = true;
    if (filterAdmin === 'Admins') matchesFilter = !!u.isAdmin;
    if (filterAdmin === 'Users') matchesFilter = !u.isAdmin;
    return matchesSearch && matchesFilter;
  });

  const renderUser = ({ item }: { item: UserData }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelectedUser(item)}>
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, item.isAdmin && styles.avatarAdmin]}>
          <Text style={[styles.avatarText, item.isAdmin && styles.avatarTextAdmin]}>
            {item.firstName?.[0]?.toUpperCase() || 'U'}
          </Text>
        </View>
        <View>
          <Text style={styles.userName}>
            {item.firstName} {item.lastName}
            {item.uid === auth.currentUser?.uid && <Text style={styles.youTag}> (You)</Text>}
          </Text>
          <Text style={styles.userEmail}>{item.email}</Text>
        </View>
      </View>
      {item.isAdmin && (
        <View style={styles.badge}>
          <MaterialCommunityIcons name="shield-check" size={14} color={COLORS.white} />
          <Text style={styles.badgeText}>ADMIN</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Management</Text>
        {/* NEW ADD BUTTON */}
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addBtn}>
          <MaterialCommunityIcons name="plus" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.controls}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color={COLORS.text} />
          <TextInput 
            style={styles.searchInput} 
            placeholder="Search name or email..." 
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.filterRow}>
          {['All', 'Admins', 'Users'].map((opt) => (
             <TouchableOpacity 
               key={opt} 
               style={[styles.filterChip, filterAdmin === opt && styles.filterChipActive]}
               onPress={() => setFilterAdmin(opt as any)}
             >
               <Text style={[styles.filterText, filterAdmin === opt && styles.filterTextActive]}>{opt}</Text>
             </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={item => item.id}
          renderItem={renderUser}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No users found.</Text>}
        />
      )}

      {/* ACTION SHEET */}
      <Modal visible={!!selectedUser && !isEditModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={() => setSelectedUser(null)}>
           <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.actionSheet}>
                   <View style={styles.sheetHeader}>
                      <Text style={styles.sheetTitle}>Manage User</Text>
                      <Text style={styles.sheetSubtitle}>{selectedUser?.firstName} {selectedUser?.lastName}</Text>
                   </View>
                   <TouchableOpacity style={styles.sheetBtn} onPress={handleInspectDevices}>
                      <View style={[styles.sheetIcon, { backgroundColor: '#E8F4FD' }]}>
                        <MaterialCommunityIcons name="chip" size={24} color={COLORS.info} />
                      </View>
                      <View>
                        <Text style={styles.sheetBtnTitle}>Inspect Devices</Text>
                        <Text style={styles.sheetBtnSub}>Check status, food levels & more</Text>
                      </View>
                   </TouchableOpacity>
                   <TouchableOpacity style={styles.sheetBtn} onPress={openEditModal}>
                      <View style={[styles.sheetIcon, { backgroundColor: '#F4F6F6' }]}>
                        <MaterialCommunityIcons name="pencil" size={24} color={COLORS.primary} />
                      </View>
                      <View>
                        <Text style={styles.sheetBtnTitle}>Edit Profile</Text>
                        <Text style={styles.sheetBtnSub}>Update name or email address</Text>
                      </View>
                   </TouchableOpacity>
                   <View style={styles.divider} />
                   <TouchableOpacity style={styles.sheetBtn} onPress={handleToggleAdmin}>
                      <View style={[styles.sheetIcon, { backgroundColor: selectedUser?.isAdmin ? '#FFF3E0' : '#E8F8F5' }]}>
                        <MaterialCommunityIcons name={selectedUser?.isAdmin ? "shield-remove" : "shield-plus"} size={24} color={selectedUser?.isAdmin ? COLORS.warning : COLORS.success} />
                      </View>
                      <View>
                        <Text style={styles.sheetBtnTitle}>{selectedUser?.isAdmin ? "Revoke Admin Access" : "Promote to Admin"}</Text>
                        <Text style={styles.sheetBtnSub}>{selectedUser?.isAdmin ? "Downgrade to standard user" : "Grant full system access"}</Text>
                      </View>
                   </TouchableOpacity>
                   <TouchableOpacity style={styles.sheetBtn} onPress={handleDeleteUser}>
                      <View style={[styles.sheetIcon, { backgroundColor: '#FDEDEC' }]}>
                        <MaterialCommunityIcons name="trash-can" size={24} color={COLORS.accent} />
                      </View>
                      <View>
                        <Text style={[styles.sheetBtnTitle, { color: COLORS.accent }]}>Delete User</Text>
                        <Text style={styles.sheetBtnSub}>Permanently remove data</Text>
                      </View>
                   </TouchableOpacity>
                   <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedUser(null)}>
                      <Text style={styles.cancelText}>Cancel</Text>
                   </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
           </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* CREATE USER MODAL */}
      <Modal visible={isCreateModalVisible} animationType="slide" presentationStyle="pageSheet">
         <SafeAreaView style={styles.modalContainer}>
             <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Create New User</Text>
                <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
             </View>
             <View style={styles.form}>
                 <Text style={styles.label}>First Name</Text>
                 <TextInput style={styles.input} value={newFirstName} onChangeText={setNewFirstName} placeholder="e.g. John" />
                 <Text style={styles.label}>Last Name</Text>
                 <TextInput style={styles.input} value={newLastName} onChangeText={setNewLastName} placeholder="e.g. Doe" />
                 <Text style={styles.label}>Email Address</Text>
                 <TextInput style={styles.input} value={newEmail} onChangeText={setNewEmail} keyboardType="email-address" autoCapitalize="none" placeholder="user@example.com" />
                 <Text style={styles.label}>Temporary Password</Text>
                 <TextInput style={styles.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Min 6 characters" />
                 
                 <TouchableOpacity style={styles.saveBtn} onPress={handleCreateUser}>
                     {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={styles.saveBtnText}>Create Account</Text>}
                 </TouchableOpacity>
             </View>
         </SafeAreaView>
      </Modal>

      {/* EDIT USER MODAL */}
      <Modal visible={isEditModalVisible} animationType="slide" presentationStyle="pageSheet">
         <SafeAreaView style={styles.modalContainer}>
             <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit User Profile</Text>
                <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
             </View>
             <View style={styles.form}>
                 <Text style={styles.label}>First Name</Text>
                 <TextInput style={styles.input} value={editFirstName} onChangeText={setEditFirstName} />
                 <Text style={styles.label}>Last Name</Text>
                 <TextInput style={styles.input} value={editLastName} onChangeText={setEditLastName} />
                 <Text style={styles.label}>Email Address</Text>
                 <TextInput style={styles.input} value={editEmail} onChangeText={setEditEmail} keyboardType="email-address" autoCapitalize="none" />
                 <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                     <Text style={styles.saveBtnText}>Save Changes</Text>
                 </TouchableOpacity>
             </View>
         </SafeAreaView>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { backgroundColor: COLORS.primary, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: 'bold' },
  backBtn: { padding: 4 },
  addBtn: { padding: 4 }, // Style for the new add button
  controls: { padding: 16, backgroundColor: COLORS.white, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5, elevation: 3 },
  searchBar: { flexDirection: 'row', backgroundColor: '#F5F6FA', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
  searchInput: { marginLeft: 8, flex: 1, fontSize: 16 },
  filterRow: { flexDirection: 'row', marginTop: 12, gap: 10 },
  filterChip: { paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: '#E8F4FD', borderColor: COLORS.info },
  filterText: { fontSize: 12, color: '#7F8C8D', fontWeight: '600' },
  filterTextActive: { color: COLORS.info },
  listContent: { padding: 16 },
  card: { backgroundColor: COLORS.white, borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3, elevation: 1 },
  cardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E0E0E0', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarAdmin: { backgroundColor: COLORS.primary },
  avatarText: { fontWeight: 'bold', color: '#7F8C8D', fontSize: 18 },
  avatarTextAdmin: { color: COLORS.white },
  userName: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  userEmail: { fontSize: 12, color: '#7F8C8D' },
  youTag: { color: COLORS.info, fontStyle: 'italic' },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, gap: 4 },
  badgeText: { color: COLORS.white, fontSize: 10, fontWeight: 'bold' },
  emptyText: { textAlign: 'center', marginTop: 40, color: '#BDC3C7', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  actionSheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  sheetHeader: { marginBottom: 20 },
  sheetTitle: { fontSize: 14, color: '#95A5A6', fontWeight: 'bold', textTransform: 'uppercase' },
  sheetSubtitle: { fontSize: 24, fontWeight: 'bold', color: COLORS.primary },
  sheetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  sheetIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  sheetBtnTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text },
  sheetBtnSub: { fontSize: 12, color: '#95A5A6' },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginVertical: 8 },
  cancelBtn: { marginTop: 12, paddingVertical: 16, alignItems: 'center', backgroundColor: '#F5F6FA', borderRadius: 12 },
  cancelText: { fontWeight: 'bold', color: COLORS.text },
  modalContainer: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: COLORS.primary },
  form: { padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#7F8C8D', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: COLORS.white, borderWidth: 1, borderColor: '#BDC3C7', borderRadius: 8, padding: 12, fontSize: 16, color: COLORS.text },
  saveBtn: { backgroundColor: COLORS.success, borderRadius: 8, padding: 16, alignItems: 'center', marginTop: 32 },
  saveBtnText: { color: COLORS.white, fontWeight: 'bold', fontSize: 16 },
});