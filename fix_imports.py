import os
import re

replacements = {
    'app/layout.tsx': [
        ("../components/Providers", "../components/core/Providers")
    ],
    'components/dashboard/Dashboard.tsx': [
        ("../types", "../../types"),
        ("../constants", "../../constants"),
        ("../contexts/AuthContext", "../../contexts/AuthContext"),
        ("../services/supabaseClient", "../../services/supabaseClient")
    ],
    'components/dashboard/TeamStatus/TeamSidebar.tsx': [
        ("../../services/supabaseClient", "../../../services/supabaseClient"),
        ("../../types", "../../../types"),
        ("../../contexts/AuthContext", "../../../contexts/AuthContext")
    ],
    'components/dashboard/ToolsGrid.tsx': [
        ("../types", "../../types"),
        ("../constants", "../../constants"),
        ("./GeminiPanel", "../features/GeminiPanel"),
        ("./StyleLens", "../features/StyleLens"),
        ("./WhiteModelDecoder", "../features/WhiteModelDecoder")
    ],
    'components/dashboard/WorkflowProgress.tsx': [
        ("../constants", "../../constants"),
        ("../types", "../../types")
    ],
    'components/dashboard/WorkflowSelector.tsx': [
        ("../types", "../../types")
    ],
    'components/features/GeminiPanel.tsx': [
        ("../services/geminiService", "../../services/geminiService"),
        ("../types", "../../types"),
        ("../contexts/AuthContext", "../../contexts/AuthContext")
    ],
    'components/features/RequestStorage.tsx': [
        ("../services/supabaseClient", "../../services/supabaseClient"),
        ("../contexts/AuthContext", "../../contexts/AuthContext"),
        ("../types", "../../types"),
        ("./SubmissionPortal/SubmissionPortal", "../portals/SubmissionPortal/SubmissionPortal"),
        ("./FileBrowser", "../viewers/FileBrowser")
    ],
    'components/features/StyleLens/AnalysisResultView.tsx': [
        ("../../types", "../../../types")
    ],
    'components/features/StyleLens/index.tsx': [
        ("../../services/geminiService", "../../../services/geminiService"),
        ("../../types", "../../../types")
    ],
    'components/features/StyleLens/JsonResultView.tsx': [
        ("../../types", "../../../types")
    ],
    'components/features/VizWorkflow/Book3DTab.tsx': [
        ("../SubmissionPortal/DrivePicker", "../../portals/SubmissionPortal/DrivePicker"),
        ("../../services/emailService", "../../../services/emailService"),
        ("../../types", "../../../types"),
        ("../../services/supabaseClient", "../../../services/supabaseClient")
    ],
    'components/features/VizWorkflow/ImageLibraryTab.tsx': [
        ("../LibraryPortal", "../../portals/LibraryPortal")
    ],
    'components/features/VizWorkflow/ModelsTab.tsx': [
        ("../ModelViewer", "../../viewers/ModelViewer"),
        ("../APSViewer", "../../viewers/APSViewer")
    ],
    'components/features/VizWorkflow/PromptGenWorkspace.tsx': [
        ("../../contexts/AuthContext", "../../../contexts/AuthContext")
    ],
    'components/features/VizWorkflow/VizWorkflowApp.tsx': [
        ("../../contexts/ThemeContext", "../../../contexts/ThemeContext"),
        ("../../contexts/AuthContext", "../../../contexts/AuthContext"),
        ("../SettingsPortal", "../../portals/SettingsPortal")
    ],
    'components/features/WhiteModelDecoder/ElementBox.tsx': [
        ("../../types", "../../../types")
    ],
    'components/features/WhiteModelDecoder/index.tsx': [
        ("../../services/geminiService", "../../../services/geminiService"),
        ("../../types", "../../../types")
    ],
    'components/portals/LibraryPortal.tsx': [
        ("../contexts/AuthContext", "../../contexts/AuthContext"),
        ("../services/googleDriveService", "../../services/googleDriveService"),
        ("./ui/tabs", "../ui/tabs"),
        ("./ui/table", "../ui/table"),
        ("./ui/button", "../ui/button"),
        ("./FileBrowser", "../viewers/FileBrowser")
    ],
    'components/portals/OutsourcePortal.tsx': [
        ("../contexts/AuthContext", "../../contexts/AuthContext"),
        ("../services/supabaseClient", "../../services/supabaseClient"),
        ("./ui/tabs", "../ui/tabs"),
        ("./ui/button", "../ui/button")
    ],
    'components/portals/RequestPortal.tsx': [
        ("../types", "../../types")
    ],
    'components/portals/SettingsPortal.tsx': [
        ("../services/supabaseClient", "../../services/supabaseClient"),
        ("../contexts/AuthContext", "../../contexts/AuthContext")
    ],
    'components/portals/SubmissionPortal/DrivePicker.tsx': [
        ("../../contexts/AuthContext", "../../../contexts/AuthContext"),
        ("../../services/googleDriveService", "../../../services/googleDriveService")
    ],
    'components/portals/SubmissionPortal/SubmissionPortal.tsx': [
        ("../../types", "../../../types"),
        ("../../contexts/AuthContext", "../../../contexts/AuthContext"),
        ("../../services/googleDriveService", "../../../services/googleDriveService")
    ],
    'components/viewers/FileBrowser.tsx': [
        ("./ui/button", "../ui/button"),
        ("./ui/table", "../ui/table"),
        ("../services/googleDriveService", "../../services/googleDriveService"),
        ("../contexts/AuthContext", "../../contexts/AuthContext"),
        ("./ui/Masonry", "../ui/Masonry"),
        ("./ui/BounceCards", "../ui/BounceCards")
    ]
}

def fix_imports():
    for file_path, replace_rules in replacements.items():
        if not os.path.exists(file_path):
            print(f"File not found: {file_path}")
            continue
            
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content
        for old_str, new_str in replace_rules:
            # Safely replace only inside quotes
            new_content = new_content.replace(f"'{old_str}'", f"'{new_str}'")
            new_content = new_content.replace(f'"{old_str}"', f'"{new_str}"')
            
        if new_content != content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {file_path}")
        else:
            print(f"No changes needed or matched in {file_path}")

if __name__ == "__main__":
    fix_imports()
