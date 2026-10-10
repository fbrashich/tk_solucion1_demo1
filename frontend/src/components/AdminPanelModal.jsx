import React, { useState, useEffect } from 'react';
import { 
  X, Users, Cpu, Plus, Trash2, Edit3, Shield, Key, 
  Check, AlertCircle, RefreshCw, Power, CheckCircle2, UserCheck, UserX
} from 'lucide-react';
import { 
  getAdminUsers, createAdminUser, updateAdminUser, deleteAdminUser,
  getDevices, createDevice, updateDevice, deleteDevice
} from '../services/api';

export default function AdminPanelModal({ isOpen, onClose, onDeviceChange }) {
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'devices'
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modales secundarios de creación/edición
  const [showUserForm, setShowUserForm] = useState(false);
  const [userFormData, setUserFormData] = useState({ username: '', password: '', role: 'operator' });

  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [deviceFormData, setDeviceFormData] = useState({
    device_id: '',
    name: '',
    type: 'Mesa Vibratoria',
    description: '',
    is_active: true
  });

  const loadData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [usersData, devicesData] = await Promise.all([
        getAdminUsers(),
        getDevices(true) // incluir inactivos
      ]);
      setUsers(usersData);
      setDevices(devicesData);
    } catch (err) {
      console.error(err);
      setErrorMsg('Error al cargar datos de administración');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const showNotification = (msg, isError = false) => {
    if (isError) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    }
  };

  // --- Handlers de Usuarios ---
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await createAdminUser(userFormData);
      showNotification(`Usuario '${userFormData.username}' creado exitosamente.`);
      setShowUserForm(false);
      setUserFormData({ username: '', password: '', role: 'operator' });
      loadData();
    } catch (err) {
      showNotification(err.response?.data?.detail || 'Error al crear usuario', true);
    }
  };

  const handleToggleUserActive = async (user) => {
    try {
      await updateAdminUser(user.id, { is_active: !user.is_active });
      showNotification(`Estado de ${user.username} actualizado.`);
      loadData();
    } catch (err) {
      showNotification(err.response?.data?.detail || 'Error al actualizar usuario', true);
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la cuenta de '${username}'?`)) return;
    try {
      await deleteAdminUser(userId);
      showNotification(`Usuario '${username}' eliminado.`);
      loadData();
    } catch (err) {
      showNotification(err.response?.data?.detail || 'Error al eliminar usuario', true);
    }
  };

  // --- Handlers de Dispositivos ---
  const handleSaveDevice = async (e) => {
    e.preventDefault();
    try {
      if (editingDeviceId) {
        await updateDevice(editingDeviceId, {
          name: deviceFormData.name,
          type: deviceFormData.type,
          description: deviceFormData.description,
          is_active: deviceFormData.is_active
        });
        showNotification(`Dispositivo '${editingDeviceId}' actualizado.`);
      } else {
        await createDevice(deviceFormData);
        showNotification(`Dispositivo '${deviceFormData.device_id}' dado de alta.`);
      }
      setShowDeviceForm(false);
      setEditingDeviceId(null);
      setDeviceFormData({ device_id: '', name: '', type: 'Mesa Vibratoria', description: '', is_active: true });
      loadData();
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      showNotification(err.response?.data?.detail || 'Error al guardar dispositivo', true);
    }
  };

  const handleEditDeviceClick = (dev) => {
    setEditingDeviceId(dev.device_id);
    setDeviceFormData({
      device_id: dev.device_id,
      name: dev.name,
      type: dev.type,
      description: dev.description || '',
      is_active: dev.is_active
    });
    setShowDeviceForm(true);
  };

  const handleDeleteDevice = async (deviceId, name) => {
    if (!window.confirm(`¿Seguro que deseas dar de baja el dispositivo '${deviceId}' (${name})?`)) return;
    try {
      await deleteDevice(deviceId);
      showNotification(`Dispositivo '${deviceId}' eliminado.`);
      loadData();
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      showNotification(err.response?.data?.detail || 'Error al eliminar dispositivo', true);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100">
        
        {/* Cabecera del Panel */}
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-purple-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>Panel de Super Administrador</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Control Total
                </span>
              </h2>
              <p className="text-xs text-slate-400">Gestión de accesos de usuarios y parque de dispositivos</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notificaciones */}
        {errorMsg && (
          <div className="bg-rose-500/20 border-b border-rose-500/30 text-rose-300 px-6 py-2.5 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 px-6 py-2.5 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Pestañas de Navegación */}
        <div className="px-6 pt-3 border-b border-slate-800 bg-slate-950/60 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 pb-3 px-2 border-b-2 font-bold text-xs transition-colors cursor-pointer ${
              activeTab === 'users'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Cuentas de Usuarios ({users.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('devices')}
            className={`flex items-center gap-2 pb-3 px-2 border-b-2 font-bold text-xs transition-colors cursor-pointer ${
              activeTab === 'devices'
                ? 'border-cyan-400 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            <span>Parque de Dispositivos ({devices.length})</span>
          </button>

          <div className="ml-auto pb-3">
            <button
              onClick={loadData}
              disabled={loading}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-cyan-400 transition-colors cursor-pointer"
              title="Refrescar datos"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Contenido Principal de Tabs */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          
          {/* ========================================================= */}
          {/* TAB 1: GESTIÓN DE USUARIOS */}
          {/* ========================================================= */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Usuarios del Sistema</h3>
                  <p className="text-xs text-slate-400">Crear accesos para operadores (Aldo) o administradores</p>
                </div>

                <button
                  onClick={() => setShowUserForm(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all shadow-lg shadow-cyan-950/40 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Nueva Cuenta</span>
                </button>
              </div>

              {/* Formulario Modal Inline para Crear Usuario */}
              {showUserForm && (
                <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/30 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-cyan-400">Registrar Nuevo Usuario</span>
                    <button 
                      onClick={() => setShowUserForm(false)} 
                      className="text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <form onSubmit={handleCreateUser} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">Usuario</label>
                      <input
                        type="text"
                        required
                        value={userFormData.username}
                        onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                        placeholder="ej. aldo_operador"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">Contraseña</label>
                      <input
                        type="password"
                        required
                        value={userFormData.password}
                        onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">Rol de Acceso</label>
                      <select
                        value={userFormData.role}
                        onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="operator">Operador (Monitoreo)</option>
                        <option value="admin">Super Admin (Acceso Total)</option>
                      </select>
                    </div>

                    <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
                      >
                        Guardar y Crear Cuenta
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Lista de Usuarios */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-white flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center text-slate-300 font-mono text-xs">
                            {u.username.slice(0, 2).toUpperCase()}
                          </div>
                          <span>{u.username}</span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            u.role === 'admin' 
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                              : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          }`}>
                            {u.role === 'admin' ? 'Super Admin' : 'Operador'}
                          </span>
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            u.is_active 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : 'bg-rose-500/10 text-rose-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                            {u.is_active ? 'Activo' : 'Suspendido'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right space-x-1.5">
                          <button
                            onClick={() => handleToggleUserActive(u)}
                            className={`p-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                              u.is_active 
                                ? 'bg-slate-800 border-slate-700 text-slate-400 hover:text-amber-400' 
                                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            }`}
                            title={u.is_active ? 'Suspender cuenta' : 'Activar cuenta'}
                          >
                            {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: GESTIÓN DE DISPOSITIVOS (ALTA / BAJA / MODIFICACIÓN) */}
          {/* ========================================================= */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Parque de Dispositivos</h3>
                  <p className="text-xs text-slate-400">Alta, baja y modificación de máquinas y mesas vibratorias</p>
                </div>

                <button
                  onClick={() => {
                    setEditingDeviceId(null);
                    setDeviceFormData({ device_id: '', name: '', type: 'Mesa Vibratoria', description: '', is_active: true });
                    setShowDeviceForm(true);
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-all shadow-lg shadow-cyan-950/40 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Alta de Dispositivo</span>
                </button>
              </div>

              {/* Formulario Modal Inline para Crear / Modificar Dispositivo */}
              {showDeviceForm && (
                <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/30 space-y-3 animate-fade-in">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-cyan-400">
                      {editingDeviceId ? `Editar Dispositivo: ${editingDeviceId}` : 'Dar de Alta Nuevo Dispositivo'}
                    </span>
                    <button 
                      onClick={() => setShowDeviceForm(false)} 
                      className="text-slate-400 hover:text-white text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>

                  <form onSubmit={handleSaveDevice} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">ID Dispositivo (Hardware)</label>
                      <input
                        type="text"
                        required
                        disabled={!!editingDeviceId}
                        value={deviceFormData.device_id}
                        onChange={(e) => setDeviceFormData({ ...deviceFormData, device_id: e.target.value.toUpperCase() })}
                        placeholder="ej. MESA_03, PALA_02"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400 font-mono disabled:opacity-50"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">Nombre Comercial</label>
                      <input
                        type="text"
                        required
                        value={deviceFormData.name}
                        onChange={(e) => setDeviceFormData({ ...deviceFormData, name: e.target.value })}
                        placeholder="ej. Mesa Vibratoria Sector B"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">Tipo de Máquina</label>
                      <input
                        type="text"
                        value={deviceFormData.type}
                        onChange={(e) => setDeviceFormData({ ...deviceFormData, type: e.target.value })}
                        placeholder="ej. Mesa Vibratoria, Pala Cargadora, Camión"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] uppercase font-bold text-slate-400 mb-1">Descripción / Ubicación</label>
                      <input
                        type="text"
                        value={deviceFormData.description}
                        onChange={(e) => setDeviceFormData({ ...deviceFormData, description: e.target.value })}
                        placeholder="ej. Planta de Beneficio Sur"
                        className="w-full px-3 py-2 text-xs rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="sm:col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="is_active_chk"
                        checked={deviceFormData.is_active}
                        onChange={(e) => setDeviceFormData({ ...deviceFormData, is_active: e.target.checked })}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                      />
                      <label htmlFor="is_active_chk" className="text-xs text-slate-300 font-medium cursor-pointer">
                        Dispositivo activo en monitoreo
                      </label>
                    </div>

                    <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer"
                      >
                        {editingDeviceId ? 'Guardar Cambios' : 'Registrar Dispositivo'}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Lista de Dispositivos */}
              <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
                <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px]">
                    <tr>
                      <th className="px-4 py-3">ID / Código</th>
                      <th className="px-4 py-3">Nombre</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {devices.map((d) => (
                      <tr key={d.device_id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-cyan-400">
                          {d.device_id}
                        </td>

                        <td className="px-4 py-3 text-white font-medium">
                          {d.name}
                          {d.description && (
                            <div className="text-[10px] text-slate-500 truncate max-w-xs">{d.description}</div>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-300">
                          {d.type}
                        </td>

                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.is_active 
                              ? 'bg-emerald-500/10 text-emerald-400' 
                              : 'bg-slate-800 text-slate-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${d.is_active ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                            {d.is_active ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right space-x-1.5">
                          <button
                            onClick={() => handleEditDeviceClick(d)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 transition-colors cursor-pointer"
                            title="Editar dispositivo"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteDevice(d.device_id, d.name)}
                            className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                            title="Dar de baja dispositivo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs text-slate-400">
          <span>Cambios sincronizados en tiempo real en la base de datos PostgreSQL</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
          >
            Cerrar Panel
          </button>
        </div>

      </div>
    </div>
  );
}
