-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users table (admin, teachers, students)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Groups (student groups assigned to a teacher)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_name VARCHAR(255) NOT NULL,
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Teacher-Student assignments (admin-manual, with group support)
CREATE TABLE teacher_student_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(student_id)
);

-- 4. Projects (student FYP, linked via student or group)
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  objective TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'revision')),
  github_repo_url TEXT,
  github_access_token TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Comments (teacher-student thread per project)
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Resource files (teacher uploads for assigned students)
CREATE TABLE resource_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  file_url TEXT,
  file_data TEXT,
  file_type VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Project uploads (student files — formal docs + supplementary)
CREATE TABLE project_uploads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT,
  file_data TEXT,
  category VARCHAR(20) NOT NULL DEFAULT 'supplementary' CHECK (category IN ('formal', 'supplementary')),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Error logs (admin-only monitoring)
CREATE TABLE error_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  level VARCHAR(20) NOT NULL DEFAULT 'error',
  message TEXT NOT NULL,
  stack TEXT,
  route VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Old FYP data (seeded mock data for AI idea recommendations)
CREATE TABLE old_fyp_data (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  objective TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  keywords TEXT[] NOT NULL DEFAULT '{}',
  category VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_groups_teacher_id ON groups(teacher_id);
CREATE INDEX idx_projects_student_id ON projects(student_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_comments_project_id ON comments(project_id);
CREATE INDEX idx_resource_files_teacher_id ON resource_files(teacher_id);
CREATE INDEX idx_project_uploads_project_id ON project_uploads(project_id);
CREATE INDEX idx_teacher_student_assignments_teacher_id ON teacher_student_assignments(teacher_id);
CREATE INDEX idx_error_logs_created_at ON error_logs(created_at DESC);
