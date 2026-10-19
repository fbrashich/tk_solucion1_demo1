import React, { useState, useEffect } from 'react';
import { 
  Users, Shield, UserPlus, LogOut, RefreshCw, 
  Trash2, ToggleLeft, ToggleRight, CheckCircle2, 
  AlertCircle, Cpu, Search, Check, X, Key,
  Layers, HardDrive, ShieldAlert, Satellite
} from 'lucide-react';
import { 
  getAdminUsers, 
  createAdminUser, 
  updateAdminUser, 
  deleteAdminUser 
} from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notification, setNotification] = useState(null);

  // Modal para crear nueva cuenta
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('operator');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal para cambiar contraseña
  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [updatedPassword, setUpdatedPassword] = useState('');

  const showToast = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadUsers = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const data = await getAdminUsers();
      setUsers(data);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      showToast('Error al conectar con el servidor para obtener cuentas', 'error');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    const cleanUsername = newUsername.trim();
    const cleanPassword = newPassword.trim();

    if (!cleanUsername || !cleanPassword) {
      showToast('Por favor completa el nombre de usuario y contraseña', 'error');
      return;
    }

    if (cleanPassword.length < 6) {
      showToast('La contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await createAdminUser({
        username: cleanUsername,
        password: cleanPassword,
        role: newRole
      });
      showToast(`Cuenta '${cleanUsername}' creada exitosamente`);
      setShowCreateModal(false);
      setNewUsername('');
      setNewPassword('');
      setNewRole('operator');
      await loadUsers();
    } catch (err) {
      console.error('Error al generar la cuenta:', err);
      const errMsg = err.response?.data?.detail || err.message || 'Error al generar la cuenta de acceso';
      showToast(errMsg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (targetUser) => {
    try {
      await updateAdminUser(targetUser.id, {
        is_active: !targetUser.is_active
      });
      showToast(`Estado de '${targetUser.username}' actualizado.`);
      await loadUsers();
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'No se pudo actualizar el estado de la cuenta';
      showToast(errMsg, 'error');
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (!passwordModalUser || !updatedPassword.trim()) return;

    if (updatedPassword.trim().length < 6) {
      showToast('La nueva contraseña debe tener al menos 6 caracteres', 'error');
      return;
    }

    try {
      await updateAdminUser(passwordModalUser.id, {
        password: updatedPassword.trim()
      });
      showToast(`Contraseña de '${passwordModalUser.username}' actualizada exitosamente`);
      setPasswordModalUser(null);
      setUpdatedPassword('');
      await loadUsers();
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || 'Error al actualizar contraseña';
      showToast(errMsg, 'error');
    }
  };

  const handleDeleteUser = async (targetUser) => {
    if (!window.confirm(`¿Estás seguro de eliminar la cuenta '${targetUser.username}'? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await deleteAdminUser(targetUser.id);
      showToast(`Cuenta '${targetUser.username}' eliminada correctamente`);
      await loadUsers();
    } catch (err) {
      const errMsg = err.response?.data?.detail || 'Error al eliminar la cuenta';
      showToast(errMsg, 'error');
    }
  };

  // Filtrado de usuarios en tiempo real
  const filteredUsers = users.filter((u) => 
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUsersCount = users.length;
  const operatorUsersCount = users.filter((u) => u.role === 'operator').length;
  const adminUsersCount = users.filter((u) => u.role === 'admin').length;
  const activeUsersCount = users.filter((u) => u.is_active).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-purple-500/30 selection:text-purple-200">
      
      {/* 1. Header del Dashboard de Super Admin */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          
          {/* Identificación del Panel */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-950/30">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-white tracking-tight">
                  Panel de Administración Central
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold uppercase tracking-wider">
                  Super Admin
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Gestión de cuentas de acceso y auditoría de parque asignado
              </p>
            </div>
          </div>

          {/* Acciones del Administrador */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => loadUsers(true)}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 border border-slate-700 text-xs font-bold text-slate-300 transition-all cursor-pointer disabled:opacity-50"
              title="Refrescar lista de usuarios"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refrescar</span>
            </button>

            {/* Acceso Rápido a Traccar / Selector */}
            <a
              href="/selector"
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 active:scale-95 border border-purple-500/30 text-xs font-bold text-purple-300 transition-all cursor-pointer"
              title="Cambiar a Consola Traccar o Selector de Plataformas"
            >
              <Satellite className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Traccar</span>
            </a>

            <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
              <div className="flex flex-col text-right hidden sm:block">
                <span className="text-xs font-bold text-white leading-none">
                  {user?.username || 'admin'}
                </span>
                <span className="text-[10px] text-purple-400 font-mono mt-0.5">
                  Administrador
                </span>
              </div>
              <button
                onClick={logout}
                className="flex items-center justify-center h-9 w-9 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 border border-rose-500/20 text-rose-300 transition-all cursor-pointer"
                title="Cerrar Sesión"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

        </div>
      </header>

      {/* Notificaciones Flotantes */}
      {notification && (
        <div className="fixed top-16 right-6 z-50 max-w-md animate-fade-in">
          <div className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl text-xs font-medium ${
            notification.type === 'error'
              ? 'bg-rose-950/90 border-rose-500/40 text-rose-200 shadow-rose-950/40'
              : 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200 shadow-emerald-950/40'
          }`}>
            {notification.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* 2. Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 space-y-6">

        {/* Banner Informativo de Alcance de Rol */}
        <div className="bg-gradient-to-r from-purple-950/30 via-slate-900 to-slate-900 border border-purple-500/20 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400 shrink-0 mt-0.5">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Modo Administración Estricta</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
                  Sin Telemetría Operativa
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Este panel está dedicado exclusivamente a la gobernanza de accesos, creación de credenciales y auditoría de cantidad de equipos asignados a cada cuenta. Las pantallas operativas y mapas corresponden a las cuentas de tipo <strong>Operador</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-purple-950/40 transition-all cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Generar Cuenta de Acceso</span>
          </button>
        </div>

        {/* Tarjetas de Resumen de Cuentas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Cuentas</span>
              <Users className="w-4 h-4 text-slate-500" />
            </div>
            <p className="text-2xl font-black text-white mt-2">{totalUsersCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Registradas en el sistema</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Operadores</span>
              <Cpu className="w-4 h-4 text-cyan-400" />
            </div>
            <p className="text-2xl font-black text-cyan-400 mt-2">{operatorUsersCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Gestión de maquinaria</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Administradores</span>
              <Shield className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-black text-purple-400 mt-2">{adminUsersCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Control de plataforma</p>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Cuentas Activas</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <p className="text-2xl font-black text-emerald-400 mt-2">{activeUsersCount}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Con acceso habilitado</p>
          </div>
        </div>

        {/* Tabla Principal: Cuentas de Acceso y Equipos Asociados */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          
          {/* Barra de Búsqueda y Filtros de la Tabla */}
          <div className="p-4 sm:p-5 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Cuentas de Acceso Registradas</span>
                <span className="text-xs text-slate-400 font-normal">
                  ({filteredUsers.length} de {users.length})
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Supervisa el estado y el volumen de dispositivos asignados a cada usuario
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por usuario o rol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>
          </div>

          {/* Tabla de Cuentas */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase font-mono tracking-wider text-[10px]">
                  <th className="px-5 py-3">Usuario</th>
                  <th className="px-5 py-3">Rol</th>
                  <th className="px-5 py-3">Estado de Acceso</th>
                  <th className="px-5 py-3">Dispositivos Asociados</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-8 text-center text-slate-400">
                      <div className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-400 rounded-full animate-spin mx-auto mb-2" />
                      <span>Cargando cuentas de acceso...</span>
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-8 text-center text-slate-400">
                      No se encontraron cuentas que coincidan con la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((u) => {
                    const isSelf = u.id === user?.id;
                    const isOperator = u.role === 'operator';

                    return (
                      <tr 
                        key={u.id}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        {/* Usuario */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                              u.role === 'admin' 
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                                : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                            }`}>
                              {u.username.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <span className="font-bold text-white block">
                                {u.username}
                              </span>
                              {isSelf && (
                                <span className="text-[10px] text-purple-400 font-mono font-medium">
                                  (Tu cuenta actual)
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Rol */}
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {u.role === 'admin' ? (
                              <>
                                <Shield className="w-3 h-3 text-purple-400" />
                                <span>Administrador</span>
                              </>
                            ) : (
                              <>
                                <Cpu className="w-3 h-3 text-cyan-400" />
                                <span>Operador de Planta</span>
                              </>
                            )}
                          </span>
                        </td>

                        {/* Estado */}
                        <td className="px-5 py-3.5">
                          <button
                            onClick={() => !isSelf && handleToggleActive(u)}
                            disabled={isSelf}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                              u.is_active 
                                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25' 
                                : 'bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25'
                            } ${isSelf ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                            title={isSelf ? 'No puedes desactivar tu propia cuenta' : 'Click para cambiar estado'}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            <span>{u.is_active ? 'Habilitado' : 'Desactivado'}</span>
                          </button>
                        </td>

                        {/* Dispositivos Asociados */}
                        <td className="px-5 py-3.5">
                          {isOperator ? (
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold font-mono ${
                                u.devices_count > 0 
                                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' 
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}>
                                <HardDrive className="w-3.5 h-3.5" />
                                <span>
                                  {u.devices_count} {u.devices_count === 1 ? 'dispositivo' : 'dispositivos'}
                                </span>
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">
                              No aplica (Admin)
                            </span>
                          )}
                        </td>

                        {/* Acciones */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Cambiar contraseña */}
                            <button
                              onClick={() => {
                                setPasswordModalUser(u);
                                setUpdatedPassword('');
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                              title={`Cambiar contraseña de ${u.username}`}
                            >
                              <Key className="w-3.5 h-3.5" />
                            </button>

                            {/* Eliminar cuenta (Solo si no es a sí mismo) */}
                            {!isSelf && (
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                                title={`Eliminar cuenta ${u.username}`}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

      </main>

      {/* MODAL: GENERAR NUEVA CUENTA DE ACCESO */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Generar Cuenta de Acceso</h3>
                  <p className="text-xs text-slate-400">Crea credenciales para un nuevo usuario</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nombre de Usuario <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. operador_norte"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Contraseña de Acceso <span className="text-purple-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Rol en el Sistema
                </label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="operator">Operador (Monitorea y da de alta maquinaria)</option>
                  <option value="admin">Administrador (Gestiona cuentas de acceso)</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 text-xs font-bold text-white shadow-lg shadow-purple-950/40 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Creando...' : 'Crear Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CAMBIAR CONTRASEÑA */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-bold text-white">
                  Nueva Contraseña para {passwordModalUser.username}
                </h3>
              </div>
              <button
                onClick={() => setPasswordModalUser(null)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Nueva Contraseña
                </label>
                <input
                  type="password"
                  required
                  placeholder="Ingresa la nueva contraseña..."
                  value={updatedPassword}
                  onChange={(e) => setUpdatedPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
