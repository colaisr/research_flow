'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useRequireAuth, useAuth } from '@/hooks/useAuth'
import { useOrganizations } from '@/hooks/useOrganizations'
import { API_BASE_URL } from '@/lib/config'
import apiClient from '@/lib/api'

interface OrganizationMember {
  id: number
  user_id: number
  email: string
  full_name: string | null
  role: string
  joined_at: string
}

interface OrganizationInvitation {
  id: number
  email: string
  role: string
  invited_by: number
  expires_at: string
  created_at: string
}

interface OrganizationDetails {
  id: number
  name: string
  slug: string | null
  owner_id: number | null
  is_personal: boolean
  created_at: string
}

async function fetchOrganizationDetails(organizationId: number): Promise<OrganizationDetails> {
  const { data } = await apiClient.get<OrganizationDetails>(
    `${API_BASE_URL}/api/organizations/${organizationId}`,
    { withCredentials: true }
  )
  return data
}

async function fetchOrganizationMembers(organizationId: number): Promise<OrganizationMember[]> {
  const { data } = await apiClient.get<OrganizationMember[]>(
    `${API_BASE_URL}/api/organizations/${organizationId}/members`,
    { withCredentials: true }
  )
  return data
}

async function inviteUser(organizationId: number, email: string, role: string): Promise<OrganizationInvitation> {
  const { data } = await apiClient.post<OrganizationInvitation>(
    `${API_BASE_URL}/api/organizations/${organizationId}/invite`,
    { email, role },
    { withCredentials: true }
  )
  return data
}

async function addUser(organizationId: number, email: string, password: string, fullName: string | null, role: string): Promise<OrganizationMember> {
  const { data } = await apiClient.post<OrganizationMember>(
    `${API_BASE_URL}/api/organizations/${organizationId}/add-user`,
    { email, password, full_name: fullName || null, role },
    { withCredentials: true }
  )
  return data
}

async function removeMember(organizationId: number, memberId: number): Promise<void> {
  await apiClient.delete(
    `${API_BASE_URL}/api/organizations/${organizationId}/members/${memberId}`,
    { withCredentials: true }
  )
}

async function updateMemberRole(organizationId: number, memberId: number, role: string): Promise<void> {
  await apiClient.put(
    `${API_BASE_URL}/api/organizations/${organizationId}/members/${memberId}/role`,
    { role },
    { withCredentials: true }
  )
}

async function transferOwnership(organizationId: number, newOwnerUserId: number): Promise<void> {
  await apiClient.post(
    `${API_BASE_URL}/api/organizations/${organizationId}/transfer-ownership`,
    { new_owner_user_id: newOwnerUserId },
    { withCredentials: true }
  )
}

export default function OrganizationManagementPage() {
  const router = useRouter()
  const params = useParams()
  const { isLoading: authLoading } = useRequireAuth()
  const { user, isOrgAdmin } = useAuth()
  const { organizations, isLoading: organizationsLoading } = useOrganizations()
  const queryClient = useQueryClient()
  
  const organizationId = parseInt(params.id as string, 10)
  
  // Fetch full organization details (includes owner_id) - this is the source of truth
  const { data: organizationDetails, isLoading: orgDetailsLoading } = useQuery({
    queryKey: ['organization-details', organizationId],
    queryFn: () => fetchOrganizationDetails(organizationId),
    enabled: !!organizationId && !authLoading,
  })
  
  // Use organizationDetails if available, otherwise fallback to organizations list
  const organization = organizationDetails || organizations.find(org => org.id === organizationId)
  
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'org_admin' | 'org_user'>('org_user')
  const [showInviteForm, setShowInviteForm] = useState(false)
  
  // Add user form state
  const [addUserEmail, setAddUserEmail] = useState('')
  const [addUserPassword, setAddUserPassword] = useState('')
  const [addUserFullName, setAddUserFullName] = useState('')
  const [addUserRole, setAddUserRole] = useState<'org_admin' | 'org_user'>('org_user')
  const [showAddUserForm, setShowAddUserForm] = useState(false)
  
  // Transfer ownership state
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [selectedNewOwnerId, setSelectedNewOwnerId] = useState<number | null>(null)

  const { data: members = [], isLoading: membersLoading, refetch: refetchMembers } = useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: () => fetchOrganizationMembers(organizationId),
    enabled: !!organizationId && !authLoading,
  })

  const inviteMutation = useMutation({
    mutationFn: (data: { email: string; role: string }) => inviteUser(organizationId, data.email, data.role),
    onSuccess: () => {
      setInviteEmail('')
      setInviteRole('org_user')
      setShowInviteForm(false)
      refetchMembers()
    },
  })

  const addUserMutation = useMutation({
    mutationFn: (data: { email: string; password: string; fullName: string | null; role: string }) => 
      addUser(organizationId, data.email, data.password, data.fullName, data.role),
    onSuccess: () => {
      setAddUserEmail('')
      setAddUserPassword('')
      setAddUserFullName('')
      setAddUserRole('org_user')
      setShowAddUserForm(false)
      refetchMembers()
    },
  })

  const removeMemberMutation = useMutation({
    mutationFn: (memberId: number) => removeMember(organizationId, memberId),
    onSuccess: () => {
      refetchMembers()
    },
  })

  const updateRoleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: number; role: string }) => 
      updateMemberRole(organizationId, memberId, role),
    onSuccess: () => {
      refetchMembers()
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
  })

  const transferOwnershipMutation = useMutation({
    mutationFn: (newOwnerUserId: number) => transferOwnership(organizationId, newOwnerUserId),
    onSuccess: () => {
      setShowTransferModal(false)
      setSelectedNewOwnerId(null)
      refetchMembers()
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
  })

  // Wait for all data to load
  if (authLoading || orgDetailsLoading || membersLoading || organizationsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600">Loading...</p>
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Organization not found</p>
          <button
            onClick={() => router.push('/user-settings?tab=organizations')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Back to Organizations
          </button>
        </div>
      </div>
    )
  }

  // Check if current user is the owner
  // Prefer organizationDetails (from API) as it's guaranteed to have owner_id
  // Fallback to organization from list if details not loaded yet
  const ownerId = organizationDetails?.owner_id ?? organization?.owner_id ?? null
  const isOwner = ownerId !== null && ownerId === user?.id
  
  // Check if user is org_admin of this organization
  const userMember = members.find(m => m.user_id === user?.id)
  
  // Owner can always manage (even if not in members list yet), org_admin can manage, platform admin can manage
  // Note: Owner should always be in members list, but check ownership first as fallback
  const canManage = isOwner || userMember?.role === 'org_admin' || user?.role === 'admin'
  
  // Debug: Log permission check (remove in production)
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('Permission check:', {
      organizationId,
      ownerId,
      userId: user?.id,
      isOwner,
      userMemberRole: userMember?.role,
      userPlatformRole: user?.role,
      canManage
    })
  }

  if (!canManage) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 mb-4">You don't have permission to manage this organization</p>
          <button
            onClick={() => router.push('/user-settings?tab=organizations')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg"
          >
            Back to Organizations
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6">
        <button
          onClick={() => router.push('/user-settings?tab=organizations')}
          className="flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-4"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Назад к организациям
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              {organization.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Управление участниками организации
            </p>
          </div>
          {isOwner && !organization.is_personal && (
            <button
              onClick={() => setShowTransferModal(true)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Передать владение
            </button>
          )}
        </div>
      </div>

      {/* Invite User Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Пригласить пользователя
          </h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowAddUserForm(!showAddUserForm)
                setShowInviteForm(false)
              }}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {showAddUserForm ? 'Отмена' : '+ Добавить пользователя'}
            </button>
            <button
              onClick={() => {
                setShowInviteForm(!showInviteForm)
                setShowAddUserForm(false)
              }}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {showInviteForm ? 'Отмена' : '+ Пригласить'}
            </button>
          </div>
        </div>

        {showInviteForm && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Email пользователя
                </label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Роль
                </label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'org_admin' | 'org_user')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="org_user">Пользователь</option>
                  <option value="org_admin">Администратор</option>
                </select>
              </div>
              {inviteMutation.isError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">
                    {(inviteMutation.error as any)?.response?.data?.detail || 'Ошибка при отправке приглашения'}
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  if (inviteEmail) {
                    inviteMutation.mutate({ email: inviteEmail, role: inviteRole })
                  }
                }}
                disabled={!inviteEmail || inviteMutation.isPending}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {inviteMutation.isPending ? 'Отправка...' : 'Отправить приглашение'}
              </button>
            </div>
          </div>
        )}

        {/* Add User Form */}
        {showAddUserForm && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Email пользователя
                </label>
                <input
                  type="email"
                  value={addUserEmail}
                  onChange={(e) => setAddUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Пароль
                </label>
                <input
                  type="password"
                  value={addUserPassword}
                  onChange={(e) => setAddUserPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Полное имя (необязательно)
                </label>
                <input
                  type="text"
                  value={addUserFullName}
                  onChange={(e) => setAddUserFullName(e.target.value)}
                  placeholder="Иван Иванов"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Роль
                </label>
                <select
                  value={addUserRole}
                  onChange={(e) => setAddUserRole(e.target.value as 'org_admin' | 'org_user')}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="org_user">Пользователь</option>
                  <option value="org_admin">Администратор</option>
                </select>
              </div>
              {addUserMutation.isError && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                  <p className="text-red-700 dark:text-red-400 text-sm">
                    {(addUserMutation.error as any)?.response?.data?.detail || 'Ошибка при добавлении пользователя'}
                  </p>
                </div>
              )}
              <button
                onClick={() => {
                  if (addUserEmail && addUserPassword) {
                    addUserMutation.mutate({ 
                      email: addUserEmail, 
                      password: addUserPassword, 
                      fullName: addUserFullName || null,
                      role: addUserRole 
                    })
                  }
                }}
                disabled={!addUserEmail || !addUserPassword || addUserMutation.isPending}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {addUserMutation.isPending ? 'Добавление...' : 'Добавить пользователя'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Members List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          Участники ({members.length})
        </h2>

        {membersLoading ? (
          <p className="text-gray-600 dark:text-gray-400">Загрузка...</p>
        ) : members.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">Нет участников</p>
        ) : (
          <div className="space-y-3">
            {members.map((member) => {
              const isCurrentUser = member.user_id === user?.id
              const isMemberOwner = organization?.owner_id === member.user_id
              const canEdit = canManage && !isCurrentUser && !isMemberOwner  // Cannot edit owner
              
              return (
                <div
                  key={member.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900 dark:text-white">
                          {member.full_name || member.email}
                        </h3>
                        {isCurrentUser && (
                          <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
                            Вы
                          </span>
                        )}
                        {isMemberOwner && (
                          <span className="text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900/30 rounded text-purple-600 dark:text-purple-400">
                            Владелец
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{member.email}</p>
                      <div className="flex gap-2 mt-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          member.role === 'org_admin'
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}>
                          {member.role === 'org_admin' ? 'Администратор' : 'Пользователь'}
                        </span>
                        <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-gray-600 dark:text-gray-400">
                          Присоединился: {new Date(member.joined_at).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-2">
                        <select
                          value={member.role}
                          onChange={(e) => updateRoleMutation.mutate({ memberId: member.id, role: e.target.value })}
                          disabled={updateRoleMutation.isPending}
                          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="org_user">Пользователь</option>
                          <option value="org_admin">Администратор</option>
                        </select>
                        <button
                          onClick={() => {
                            if (confirm(`Удалить ${member.email} из организации?`)) {
                              removeMemberMutation.mutate(member.id)
                            }
                          }}
                          disabled={removeMemberMutation.isPending}
                          className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg transition-colors"
                        >
                          Удалить
                        </button>
                      </div>
                    )}
                    {isMemberOwner && (
                      <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                        Нельзя удалить или изменить роль владельца
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Transfer Ownership Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
              Передать владение организацией
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Выберите нового владельца организации. После передачи вы больше не сможете управлять организацией.
            </p>
            
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Новый владелец
              </label>
              <select
                value={selectedNewOwnerId || ''}
                onChange={(e) => setSelectedNewOwnerId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">-- Выберите участника --</option>
                {members
                  .filter(m => m.user_id !== user?.id)  // Cannot transfer to yourself
                  .map((member) => (
                    <option key={member.id} value={member.user_id}>
                      {member.full_name || member.email} ({member.email})
                    </option>
                  ))}
              </select>
            </div>

            {transferOwnershipMutation.isError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 mb-4">
                <p className="text-red-700 dark:text-red-400 text-sm">
                  {(transferOwnershipMutation.error as any)?.response?.data?.detail || 'Ошибка при передаче владения'}
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowTransferModal(false)
                  setSelectedNewOwnerId(null)
                }}
                disabled={transferOwnershipMutation.isPending}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={() => {
                  if (selectedNewOwnerId && confirm(`Вы уверены, что хотите передать владение организацией "${organization.name}" пользователю ${members.find(m => m.user_id === selectedNewOwnerId)?.email}?`)) {
                    transferOwnershipMutation.mutate(selectedNewOwnerId)
                  }
                }}
                disabled={!selectedNewOwnerId || transferOwnershipMutation.isPending}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
              >
                {transferOwnershipMutation.isPending ? 'Передача...' : 'Передать владение'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


