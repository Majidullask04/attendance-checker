export const ADMIN_EMAIL = 'mrelectricalworks02@gmail.com';

export function getRoleForEmail(email) {
  if (!email) return 'user';
  return email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() ? 'admin' : 'user';
}

export function createUserInfoFromEmail(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const role = getRoleForEmail(normalizedEmail);
  
  if (role === 'admin') {
    return {
      id: 'admin-001',
      email: ADMIN_EMAIL,
      name: 'Mr. Electrical Admin',
      role: 'admin',
      department: 'Management',
      avatar: '⚡',
      deviceId: 'dev-admin-main',
    };
  }

  // Derive name from email prefix
  const prefix = normalizedEmail.split('@')[0] || 'User';
  const name = prefix
    .split(/[._-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Generate consistent deviceId and avatar based on email
  let hash = 0;
  for (let i = 0; i < normalizedEmail.length; i++) {
    hash = (hash << 5) - hash + normalizedEmail.charCodeAt(i);
    hash |= 0;
  }
  
  const avatars = ['👷', '👩‍🔧', '🧑‍🔧', '👩‍💼', '👨‍🔬', '⚡', '🛠️', '🔌'];
  const depts = ['Electrical', 'Maintenance', 'Field Operations', 'HVAC', 'Plumbing'];
  
  const avatar = avatars[Math.abs(hash) % avatars.length];
  const department = depts[Math.abs(hash) % depts.length];
  const id = `emp-${Math.abs(hash).toString(16).padStart(4, '0').slice(0, 4)}`;

  return {
    id,
    email: normalizedEmail,
    name: name || 'Field Technician',
    role: 'user',
    department,
    avatar,
    deviceId: `dev-${id}`,
  };
}
