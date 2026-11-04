const pool = require('../db');

async function seedWorkforceData() {
  const connection = await pool.getConnection();
  try {
    console.log('--- Starting Workforce & Department Data Population ---');

    // 1. Remove leftover test departments
    await connection.query("DELETE FROM departments WHERE name LIKE 'Workforce Test Dept%' OR name = 'Csrf Dept'");

    // 2. Define departments with target approved headcounts
    const deptTargets = [
      { name: 'Engineering', approved: 35 },
      { name: 'Human Resources', approved: 4 },
      { name: 'Marketing', approved: 8 },
      { name: 'Finance', approved: 4 },
      { name: 'Sales', approved: 5 },
      { name: 'R&D', approved: 6 },
      { name: 'Frontend', approved: 5 },
      { name: 'Database', approved: 2 },
      { name: 'Backend', approved: 7 },
      { name: 'Full Stack', approved: 4 },
      { name: 'Web Development', approved: 4 },
      { name: 'AI', approved: 8 },
      { name: 'IT', approved: 3 },
      { name: 'Cybersecurity', approved: 5 },
      { name: 'Product & Design', approved: 0 }, // For "Not Set"
    ];

    // Ensure departments exist and update approved_headcount
    const deptMap = {};
    for (const dt of deptTargets) {
      const [existing] = await connection.query('SELECT id FROM departments WHERE name = ?', [dt.name]);
      let deptId;
      if (existing.length > 0) {
        deptId = existing[0].id;
        await connection.query('UPDATE departments SET approved_headcount = ? WHERE id = ?', [dt.approved, deptId]);
      } else {
        const [ins] = await connection.query(
          'INSERT INTO departments (name, approved_headcount) VALUES (?, ?)',
          [dt.name, dt.approved]
        );
        deptId = ins.insertId;
      }
      deptMap[dt.name] = deptId;
      console.log(`✓ Department "${dt.name}" (ID #${deptId}) set to approved_headcount = ${dt.approved}`);
    }

    // 3. Define employee list to populate across departments
    const employeesToSeed = [
      // Human Resources (Target: 4, Current will be 4 => Balanced)
      { name: 'Sarah Jenkins', email: 'sarah.jenkins@company.com', phone: '+1-555-0101', dept: 'Human Resources', designation: 'Senior HR Business Partner' },
      { name: 'Marcus Vance', email: 'marcus.vance@company.com', phone: '+1-555-0102', dept: 'Human Resources', designation: 'Talent Acquisition Lead' },
      { name: 'Emily Chen', email: 'emily.chen@company.com', phone: '+1-555-0103', dept: 'Human Resources', designation: 'People Operations Specialist' },

      // Marketing (Target: 8, Current will be 6 => Needs Hiring)
      { name: 'Liam Gallagher', email: 'liam.gallagher@company.com', phone: '+1-555-0111', dept: 'Marketing', designation: 'VP of Growth & Brand' },
      { name: 'Olivia Martinez', email: 'olivia.martinez@company.com', phone: '+1-555-0112', dept: 'Marketing', designation: 'Senior Content Strategist' },
      { name: 'Noah Patel', email: 'noah.patel@company.com', phone: '+1-555-0113', dept: 'Marketing', designation: 'Product Marketing Manager' },
      { name: 'Ava Kowalski', email: 'ava.kowalski@company.com', phone: '+1-555-0114', dept: 'Marketing', designation: 'SEO & Organic Growth Lead' },
      { name: 'Sophia Rossi', email: 'sophia.rossi@company.com', phone: '+1-555-0115', dept: 'Marketing', designation: 'Brand Visual Designer' },
      { name: 'Ethan Hunt', email: 'ethan.hunt@company.com', phone: '+1-555-0116', dept: 'Marketing', designation: 'Social Media & Community Lead' },

      // Finance (Target: 4, Current will be 4 => Balanced)
      { name: 'David Kim', email: 'david.kim@company.com', phone: '+1-555-0121', dept: 'Finance', designation: 'Director of Corporate Finance' },
      { name: 'Chloe Dubois', email: 'chloe.dubois@company.com', phone: '+1-555-0122', dept: 'Finance', designation: 'Senior Financial Analyst' },
      { name: 'Alexander Wright', email: 'alexander.wright@company.com', phone: '+1-555-0123', dept: 'Finance', designation: 'Controller & Compliance Manager' },
      { name: 'Mia Thompson', email: 'mia.thompson@company.com', phone: '+1-555-0124', dept: 'Finance', designation: 'Payroll & Treasury Lead' },

      // Sales (Target: 5, Already has 2, adding 4 => 6 total => Overstaffed - Review)
      { name: 'Daniel Craig', email: 'daniel.craig@company.com', phone: '+1-555-0131', dept: 'Sales', designation: 'Head of Enterprise Sales' },
      { name: 'Jessica Taylor', email: 'jessica.taylor@company.com', phone: '+1-555-0132', dept: 'Sales', designation: 'Strategic Account Executive' },
      { name: 'Benjamin Scott', email: 'benjamin.scott@company.com', phone: '+1-555-0133', dept: 'Sales', designation: 'Business Development Representative' },
      { name: 'Hannah Abbott', email: 'hannah.abbott@company.com', phone: '+1-555-0134', dept: 'Sales', designation: 'Sales Operations Specialist' },

      // R&D (Target: 6, Current will be 4 => Needs Hiring)
      { name: 'Dr. Robert Oppen', email: 'robert.oppen@company.com', phone: '+1-555-0141', dept: 'R&D', designation: 'Principal Research Scientist' },
      { name: 'Elena Rostova', email: 'elena.rostova@company.com', phone: '+1-555-0142', dept: 'R&D', designation: 'Robotics & Hardware Specialist' },
      { name: 'Julian Morales', email: 'julian.morales@company.com', phone: '+1-555-0143', dept: 'R&D', designation: 'Embedded Firmware Architect' },
      { name: 'Grace Hopper-Lee', email: 'grace.hopper@company.com', phone: '+1-555-0144', dept: 'R&D', designation: 'Quantum Computing Researcher' },

      // Frontend (Target: 5, Current will be 5 => Balanced)
      { name: 'Lucas Silva', email: 'lucas.silva@company.com', phone: '+1-555-0151', dept: 'Frontend', designation: 'Staff UI Architect' },
      { name: 'Amelia Watson', email: 'amelia.watson@company.com', phone: '+1-555-0152', dept: 'Frontend', designation: 'Senior React & Design Systems Engineer' },
      { name: 'Oliver Twist', email: 'oliver.twist@company.com', phone: '+1-555-0153', dept: 'Frontend', designation: 'Motion UI & Accessibility Specialist' },
      { name: 'Zoe Kravitz', email: 'zoe.kravitz@company.com', phone: '+1-555-0154', dept: 'Frontend', designation: 'Next.js Frontend Developer' },
      { name: 'Felix Baum', email: 'felix.baum@company.com', phone: '+1-555-0155', dept: 'Frontend', designation: 'Web Performance Engineer' },

      // Database (Target: 2, Current will be 3 => Overstaffed - Review)
      { name: 'Priya Sharma', email: 'priya.sharma@company.com', phone: '+1-555-0161', dept: 'Database', designation: 'Lead Database Administrator (DBA)' },
      { name: 'Kenji Sato', email: 'kenji.sato@company.com', phone: '+1-555-0162', dept: 'Database', designation: 'PostgreSQL & MySQL Scalability Engineer' },
      { name: 'Dmitri Volkov', email: 'dmitri.volkov@company.com', phone: '+1-555-0163', dept: 'Database', designation: 'Data Warehouse Architect' },

      // Backend (Target: 7, Current will be 5 => Needs Hiring)
      { name: 'Henry Cavill', email: 'henry.cavill@company.com', phone: '+1-555-0171', dept: 'Backend', designation: 'Staff Backend Architect' },
      { name: 'Nadia Petrova', email: 'nadia.petrova@company.com', phone: '+1-555-0172', dept: 'Backend', designation: 'Distributed Systems & Go Engineer' },
      { name: 'Tariq Al-Mansoor', email: 'tariq.mansoor@company.com', phone: '+1-555-0173', dept: 'Backend', designation: 'Senior Node.js Microservices Dev' },
      { name: 'Claire Redfield', email: 'claire.redfield@company.com', phone: '+1-555-0174', dept: 'Backend', designation: 'Kafka & Event Streaming Specialist' },
      { name: 'Leo Noceda', email: 'leo.noceda@company.com', phone: '+1-555-0175', dept: 'Backend', designation: 'High-Throughput API Developer' },

      // Full Stack (Target: 4, Current will be 4 => Balanced)
      { name: 'Jordan Belfort', email: 'jordan.belfort@company.com', phone: '+1-555-0181', dept: 'Full Stack', designation: 'Principal Full Stack Engineer' },
      { name: 'Stella Artois', email: 'stella.artois@company.com', phone: '+1-555-0182', dept: 'Full Stack', designation: 'Senior TypeScript Full Stack Dev' },
      { name: 'Victor Hugo', email: 'victor.hugo@company.com', phone: '+1-555-0183', dept: 'Full Stack', designation: 'Full Stack Cloud Integrations Dev' },
      { name: 'Layla Vance', email: 'layla.vance@company.com', phone: '+1-555-0184', dept: 'Full Stack', designation: 'Full Stack Platform Developer' },

      // Web Development (Target: 4, Current will be 3 => Needs Hiring)
      { name: 'Gordon Freeman', email: 'gordon.freeman@company.com', phone: '+1-555-0191', dept: 'Web Development', designation: 'Webmaster & CMS Tech Lead' },
      { name: 'Alyx Vance', email: 'alyx.vance@company.com', phone: '+1-555-0192', dept: 'Web Development', designation: 'Creative Front & Web Developer' },
      { name: 'Barney Calhoun', email: 'barney.calhoun@company.com', phone: '+1-555-0193', dept: 'Web Development', designation: 'Web Systems Specialist' },

      // AI (Target: 8, Current will be 5 => Needs Hiring)
      { name: 'Dr. Maya Lin', email: 'maya.lin@company.com', phone: '+1-555-0201', dept: 'AI', designation: 'Head of Machine Learning & AI' },
      { name: 'Arjun Reddy', email: 'arjun.reddy@company.com', phone: '+1-555-0202', dept: 'AI', designation: 'LLM & Generative AI Systems Architect' },
      { name: 'Sophie Germain', email: 'sophie.germain@company.com', phone: '+1-555-0203', dept: 'AI', designation: 'Computer Vision & Diffusion Scientist' },
      { name: 'Klaus Weber', email: 'klaus.weber@company.com', phone: '+1-555-0204', dept: 'AI', designation: 'MLOps & Inference Platform Engineer' },
      { name: 'Iris West', email: 'iris.west@company.com', phone: '+1-555-0205', dept: 'AI', designation: 'AI Evaluation & Alignment Lead' },

      // IT (Target: 3, Current will be 4 => Overstaffed - Review)
      { name: 'Richard Hendricks', email: 'richard.hendricks@company.com', phone: '+1-555-0211', dept: 'IT', designation: 'Director of IT Infrastructure' },
      { name: 'Bertram Gilfoyle', email: 'bertram.gilfoyle@company.com', phone: '+1-555-0212', dept: 'IT', designation: 'Senior Systems & Cloud Administrator' },
      { name: 'Dinesh Chugtai', email: 'dinesh.chugtai@company.com', phone: '+1-555-0213', dept: 'IT', designation: 'Enterprise Network & Firewall Engineer' },
      { name: 'Jared Dunn', email: 'jared.dunn@company.com', phone: '+1-555-0214', dept: 'IT', designation: 'IT Support & Asset Operations Specialist' },

      // Cybersecurity (Target: 5, Current will be 4 => Needs Hiring)
      { name: 'Elliot Alderson', email: 'elliot.alderson@company.com', phone: '+1-555-0221', dept: 'Cybersecurity', designation: 'Chief Information Security Officer' },
      { name: 'Darlene Alderson', email: 'darlene.alderson@company.com', phone: '+1-555-0222', dept: 'Cybersecurity', designation: 'Lead Penetration Tester & Red Teamer' },
      { name: 'Angela Moss', email: 'angela.moss@company.com', phone: '+1-555-0223', dept: 'Cybersecurity', designation: 'SOC Manager & Threat Hunting Lead' },
      { name: 'Tyrell Wellick', email: 'tyrell.wellick@company.com', phone: '+1-555-0224', dept: 'Cybersecurity', designation: 'Cloud Security Architecture Specialist' },
    ];

    let insertedCount = 0;
    for (const emp of employeesToSeed) {
      const deptId = deptMap[emp.dept];
      if (!deptId) continue;

      const [existing] = await connection.query('SELECT id FROM employees WHERE email = ?', [emp.email]);
      if (existing.length === 0) {
        await connection.query(
          `INSERT INTO employees (name, email, phone, department_id, designation, status, deleted_at) 
           VALUES (?, ?, ?, ?, ?, 'Active', NULL)`,
          [emp.name, emp.email, emp.phone, deptId, emp.designation]
        );
        insertedCount++;
      } else {
        // Update department and status to Active
        await connection.query(
          `UPDATE employees SET department_id = ?, status = 'Active', deleted_at = NULL WHERE id = ?`,
          [deptId, existing[0].id]
        );
      }
    }

    console.log(`✓ Inserted/Synchronized ${insertedCount} new employees across departments!`);
    console.log('--- Workforce Data Population Completed Successfully! ---');
  } catch (err) {
    console.error('Error seeding workforce data:', err);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

seedWorkforceData();
