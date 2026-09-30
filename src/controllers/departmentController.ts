import { Request, Response } from 'express';
import { prisma } from '../config/db';

const defaultDepartments = [
  {
    name: 'BFP',
    fullName: 'Bureau of Fire Protection - Balayan',
    headOfficer: 'FInsp. Noel L. Alcantara',
    contact: '(043) 211-6387',
    email: 'bfp.balayan@gmail.com',
    personnelCount: 42,
    equipment: ['Fire Engines', 'Ladder Truck', 'Hazmat Suits', 'Water Tanker'],
    status: 'Available',
  },
  {
    name: 'PNP',
    fullName: 'Municipal Police Station - Balayan',
    headOfficer: 'PMAJ. Gerry L. Laylo',
    contact: '(043) 211-4325',
    email: 'pnp.balayan@gmail.com',
    personnelCount: 88,
    equipment: ['Patrol Units', 'Tactical Gear', 'K9 Unit', 'Traffic Patrols'],
    status: 'Available',
  },
  {
    name: 'MEDICAL',
    fullName: 'Municipal Health Office / EMS',
    headOfficer: 'Dr. Maria Victoria B. Ozaeta',
    contact: '(043) 911-0012',
    email: 'mho.balayan@gmail.com',
    personnelCount: 35,
    equipment: ['Ambulances', 'First Aid Squads', 'Mobile Clinic', 'Defibrillators'],
    status: 'Deployed',
  },
  {
    name: 'ENGINEERING',
    fullName: 'Municipal Engineering Office',
    headOfficer: 'Engr. Ricardo D. Pamintuan',
    contact: '(043) 211-5678',
    email: 'engineering.balayan@gov.ph',
    personnelCount: 28,
    equipment: ['Dump Trucks', 'Bulldozer', 'Backhoe Loader', 'Chainsaws'],
    status: 'On Standby',
  },
  {
    name: 'RESCUE',
    fullName: 'MDRRMO Rescue Team',
    headOfficer: 'Dir. Alejandro G. Perez',
    contact: '(043) 211-1234',
    email: 'mdrrmo.balayan@gmail.com',
    personnelCount: 52,
    equipment: ['Rescue Boats', 'Amphibious Vehicle', 'Search Drones', 'Life Vests'],
    status: 'Available',
  },
];

// Helper function to sync department status based on assigned incidents
export async function syncDepartmentStatuses() {
  try {
    const departments = await prisma.departmentInfo.findMany();
    const incidents = await prisma.incident.findMany();

    for (const dept of departments) {
      // Find incidents assigned to this department
      // Match by name (BFP, PNP, MEDICAL, ENGINEERING, RESCUE)
      const deptIncidents = incidents.filter(
        (inc) => inc.assignedDepartment === dept.name
      );

      let calculatedStatus = 'Available';
      if (deptIncidents.some((inc) => inc.status === 'DISPATCHED')) {
        calculatedStatus = 'Deployed';
      } else if (
        deptIncidents.some((inc) => inc.status === 'REVIEWING' || inc.status === 'PENDING')
      ) {
        calculatedStatus = 'On Standby';
      } else {
        calculatedStatus = 'Available';
      }

      if (dept.status !== calculatedStatus) {
        await prisma.departmentInfo.update({
          where: { id: dept.id },
          data: { status: calculatedStatus },
        });
        dept.status = calculatedStatus;
      }
    }
  } catch (error: any) {
    console.error('⚠️ Failed to sync department statuses:', error.message);
  }
}

// GET /api/departments
export const getDepartments = async (req: Request, res: Response) => {
  try {
    let departments = await prisma.departmentInfo.findMany({
      orderBy: { name: 'asc' },
    });

    // Auto-seed if database has no department records
    if (departments.length === 0) {
      console.log('🌱 No department records found. Seeding defaults for Balayan...');
      await prisma.departmentInfo.createMany({
        data: defaultDepartments,
      });
    }

    // Always sync status before returning
    await syncDepartmentStatuses();

    // Fetch the updated departments list
    departments = await prisma.departmentInfo.findMany({
      orderBy: { name: 'asc' },
    });

    res.json(departments);
  } catch (error: any) {
    console.error('❌ GET departments error:', error.message);
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
};

// POST /api/departments
export const createDepartment = async (req: Request, res: Response) => {
  try {
    const { name, fullName, headOfficer, contact, email, personnelCount, equipment, status } = req.body;

    if (!name || !fullName || !headOfficer || !contact || !email) {
      return res.status(400).json({ error: 'Missing required department fields' });
    }

    // Check if name is unique
    const existing = await prisma.departmentInfo.findUnique({
      where: { name },
    });
    if (existing) {
      return res.status(400).json({ error: `Department code '${name}' already exists` });
    }

    const newDept = await prisma.departmentInfo.create({
      data: {
        name: name.toUpperCase(),
        fullName,
        headOfficer,
        contact,
        email,
        personnelCount: personnelCount ? parseInt(personnelCount.toString()) : 0,
        equipment: Array.isArray(equipment) ? equipment : [],
        status: status || 'Available',
      },
    });

    console.log(`➕ Department created: ${newDept.name}`);
    res.status(201).json(newDept);
  } catch (error: any) {
    console.error('❌ CREATE department error:', error.message);
    res.status(500).json({ error: 'Failed to create department' });
  }
};

// PUT /api/departments/:id
export const updateDepartment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, fullName, headOfficer, contact, email, personnelCount, equipment, status } = req.body;

    const data: any = {};
    if (name) data.name = name.toUpperCase();
    if (fullName) data.fullName = fullName;
    if (headOfficer) data.headOfficer = headOfficer;
    if (contact) data.contact = contact;
    if (email) data.email = email;
    if (personnelCount !== undefined) data.personnelCount = parseInt(personnelCount.toString());
    if (equipment !== undefined) data.equipment = Array.isArray(equipment) ? equipment : [];
    if (status) data.status = status;

    const updatedDept = await prisma.departmentInfo.update({
      where: { id },
      data,
    });

    console.log(`✏️ Department updated: ${updatedDept.name}`);
    res.json(updatedDept);
  } catch (error: any) {
    console.error('❌ UPDATE department error:', error.message);
    res.status(500).json({ error: 'Failed to update department' });
  }
};

// DELETE /api/departments/:id
export const deleteDepartment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deletedDept = await prisma.departmentInfo.delete({
      where: { id },
    });

    console.log(`❌ Department deleted: ${deletedDept.name}`);
    res.json({ message: 'Department successfully deleted', id });
  } catch (error: any) {
    console.error('❌ DELETE department error:', error.message);
    res.status(500).json({ error: 'Failed to delete department' });
  }
};
