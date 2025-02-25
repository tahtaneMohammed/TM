import React, { useState, ChangeEvent } from 'react';
import { Upload, Check, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DayDistribution, RoomDistribution } from './types';

function App() {
  const [distributions, setDistributions] = useState<DayDistribution[]>([]);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [professors, setProfessors] = useState<string[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [tempProfessors, setTempProfessors] = useState<string[]>([]);

  // Constants for room configuration
  const ROOMS_WITH_TWO = 15;
  const ROOMS_WITH_ONE = 11;
  const TOTAL_ROOMS = ROOMS_WITH_TWO + ROOMS_WITH_ONE;
  const NUM_DAYS = 4;
  const REQUIRED_PROFESSORS = ROOMS_WITH_TWO * 2 + ROOMS_WITH_ONE;

  // Create rooms array
  const rooms = Array.from({ length: TOTAL_ROOMS }, (_, i) => `القاعة ${i + 1}`);

  // Function to create a unique key for a professor pair
  const getPairKey = (prof1: string, prof2: string): string => {
    return [prof1, prof2].sort().join('|');
  };

  // Function to check if professors have been paired in previous days
  const haveProfessorsPaired = (
    prof1: string,
    prof2: string,
    distributions: DayDistribution[]
  ): boolean => {
    return distributions.some(dayDist => {
      return Object.values(dayDist.distribution).some(profs => {
        if (profs.length === 2) {
          const [p1, p2] = profs;
          return (p1 === prof1 && p2 === prof2) || (p1 === prof2 && p2 === prof1);
        }
        return false;
      });
    });
  };

  // Function to check if a professor has been assigned to a room in previous days
  const hasRoomAssignment = (
    professor: string,
    room: string,
    distributions: DayDistribution[]
  ): boolean => {
    return distributions.some(dayDist => {
      const roomAssignment = dayDist.distribution[room];
      return roomAssignment && roomAssignment.includes(professor);
    });
  };

  // Function to get available professor pairs for a room
  const getAvailablePairs = (
    professors: string[],
    room: string,
    previousDistributions: DayDistribution[],
    alreadyAssignedToday: string[]
  ): [string, string][] => {
    const availableProfessors = professors.filter(
      prof => !hasRoomAssignment(prof, room, previousDistributions) && !alreadyAssignedToday.includes(prof)
    );

    const pairs: [string, string][] = [];
    for (let i = 0; i < availableProfessors.length; i++) {
      for (let j = i + 1; j < availableProfessors.length; j++) {
        const prof1 = availableProfessors[i];
        const prof2 = availableProfessors[j];
        if (!haveProfessorsPaired(prof1, prof2, previousDistributions)) {
          pairs.push([prof1, prof2]);
        }
      }
    }
    return pairs;
  };

  // Function to get available professors for a single-supervisor room
  const getAvailableProfessors = (
    professors: string[],
    room: string,
    previousDistributions: DayDistribution[],
    alreadyAssignedToday: string[]
  ): string[] => {
    return professors.filter(professor => 
      !hasRoomAssignment(professor, room, previousDistributions) && 
      !alreadyAssignedToday.includes(professor)
    );
  };

  const distributeProfessors = (inputProfessors: string[]) => {
    setProfessors(inputProfessors);
    const newDistributions: DayDistribution[] = [];
    let maxAttempts = 100; // Prevent infinite loops
    let currentAttempt = 0;

    while (currentAttempt < maxAttempts) {
      try {
        newDistributions.length = 0; // Clear previous attempts

        for (let day = 0; day < NUM_DAYS; day++) {
          const dayDistribution: RoomDistribution = {};
          const assignedProfessorsToday = new Set<string>();

          // Handle rooms that need two supervisors first
          for (let i = 0; i < ROOMS_WITH_TWO; i++) {
            const room = rooms[i];
            const availablePairs = getAvailablePairs(
              inputProfessors,
              room,
              newDistributions,
              Array.from(assignedProfessorsToday)
            );

            if (availablePairs.length === 0) {
              throw new Error("Retry needed: No valid professor pairs available");
            }

            // Randomly select a pair
            const selectedPair = availablePairs[Math.floor(Math.random() * availablePairs.length)];
            dayDistribution[room] = selectedPair;
            selectedPair.forEach(prof => assignedProfessorsToday.add(prof));
          }

          // Handle rooms that need one supervisor
          for (let i = ROOMS_WITH_TWO; i < TOTAL_ROOMS; i++) {
            const room = rooms[i];
            const availableProfessors = getAvailableProfessors(
              inputProfessors,
              room,
              newDistributions,
              Array.from(assignedProfessorsToday)
            );

            if (availableProfessors.length === 0) {
              throw new Error("Retry needed: No available professors for single supervision");
            }

            // Randomly select one professor
            const selectedProfessor = availableProfessors[Math.floor(Math.random() * availableProfessors.length)];
            dayDistribution[room] = [selectedProfessor];
            assignedProfessorsToday.add(selectedProfessor);
          }

          newDistributions.push({ day: day + 1, distribution: dayDistribution });
        }

        // If we reach here, we have a valid distribution
        break;
      } catch (error) {
        currentAttempt++;
        if (currentAttempt === maxAttempts) {
          setError("لم نتمكن من إيجاد توزيع مثالي. يرجى المحاولة مرة أخرى أو إضافة المزيد من الأساتذة.");
          return;
        }
        continue;
      }
    }

    setDistributions(newDistributions);
    setError('');
    setShowReview(false);
  };

  const handleFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setError("الرجاء تحميل ملف Excel.");
      return;
    }

    setLoading(true);
    setError('');
    setDistributions([]);
    setShowReview(false);

    try {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            throw new Error("فشل في قراءة الملف");
          }

          const workbook = XLSX.read(data, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          
          // Try different methods to read the data
          let professorsList: string[] = [];
          
          // Method 1: Read as array
          const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          if (Array.isArray(rawData)) {
            // Collect all non-empty values from all rows
            professorsList = rawData.flatMap(row => 
              Array.isArray(row) ? row.filter(cell => cell && String(cell).trim()) : []
            );
          }

          if (professorsList.length === 0) {
            // Method 2: Read as object
            const objData = XLSX.utils.sheet_to_json(worksheet);
            if (Array.isArray(objData)) {
              professorsList = objData.flatMap(row => 
                Object.values(row).filter(cell => cell && String(cell).trim())
              );
            }
          }

          // Clean up the data
          professorsList = professorsList
            .map(p => String(p).trim())
            .filter(p => p && p !== 'null' && p !== 'undefined' && p.length > 0);

          // Remove duplicates
          professorsList = [...new Set(professorsList)];

          if (professorsList.length === 0) {
            throw new Error("لم يتم العثور على بيانات في الملف. تأكد من وجود أسماء الأساتذة في الملف.");
          }

          setTempProfessors(professorsList);
          setShowReview(true);

          if (professorsList.length < REQUIRED_PROFESSORS) {
            setError(`تحذير: تم العثور على ${professorsList.length} أستاذ فقط. سيتم تكرار بعض الأساتذة في التوزيع.`);
          }
        } catch (error) {
          setError(error instanceof Error ? error.message : "حدث خطأ أثناء معالجة الملف");
        } finally {
          setLoading(false);
        }
      };

      reader.onerror = () => {
        setError("فشل في قراءة الملف");
        setLoading(false);
      };

      reader.readAsBinaryString(file);
    } catch (error) {
      setError("حدث خطأ أثناء قراءة الملف. تأكد من أن الملف صحيح.");
      setLoading(false);
    }
  };

  // Function to get room assignment for a professor on a specific day
  const getProfessorRoom = (professor: string, day: number): string => {
    const dayDist = distributions[day - 1];
    if (!dayDist) return '';
    
    for (const [room, profs] of Object.entries(dayDist.distribution)) {
      if (profs.includes(professor)) {
        return room;
      }
    }
    return '';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e3c72] to-[#2a5298] py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold text-center text-white mb-8 drop-shadow-lg">
          توزيع الأساتذة على القاعات
        </h1>

        <div className="bg-white/90 rounded-xl shadow-xl p-6">
          <div className="flex flex-col items-center gap-4 mb-6">
            <label className="relative cursor-pointer bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg transition-colors duration-200 flex items-center gap-2">
              <Upload size={20} />
              تحميل ملف Excel
              <input
                type="file"
                className="hidden"
                accept=".xlsx, .xls"
                onChange={handleFile}
              />
            </label>
            <p className="text-sm text-gray-600 text-center">
              يجب أن يحتوي الملف على أسماء الأساتذة
            </p>
          </div>

          {loading && (
            <div className="text-center text-blue-600 font-bold mb-4">
              جاري معالجة الملف...
            </div>
          )}

          {error && (
            <div className={`text-center font-bold mb-4 p-4 rounded-lg ${
              error.startsWith('تحذير') ? 'bg-yellow-50 text-yellow-700' : 'bg-red-50 text-red-600'
            }`}>
              {error}
            </div>
          )}

          {showReview && (
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-center mb-4">مراجعة قائمة الأساتذة</h2>
              <div className="bg-gray-50 p-4 rounded-lg mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tempProfessors.map((professor, index) => (
                    <div key={index} className="bg-white p-2 rounded border">
                      {index + 1}. {professor}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-center gap-4">
                <button
                  onClick={() => distributeProfessors(tempProfessors)}
                  className="bg-green-600 hover:bg-green-700 text-white py-2 px-6 rounded-lg flex items-center gap-2"
                >
                  <Check size={20} />
                  موافقة وتوزيع
                </button>
                <label className="cursor-pointer bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-6 rounded-lg flex items-center gap-2">
                  <RefreshCw size={20} />
                  إعادة التحميل
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx, .xls"
                    onChange={handleFile}
                  />
                </label>
              </div>
            </div>
          )}

          {distributions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 bg-white">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-4 py-2 text-right">اسم الأستاذ</th>
                    {Array.from({ length: NUM_DAYS }, (_, i) => (
                      <th key={i} className="border border-gray-200 px-4 py-2 text-center">
                        اليوم {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {professors.map((professor, index) => (
                    <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                      <td className="border border-gray-200 px-4 py-2 font-medium">
                        {professor}
                      </td>
                      {Array.from({ length: NUM_DAYS }, (_, day) => (
                        <td key={day} className="border border-gray-200 px-4 py-2 text-center">
                          {getProfessorRoom(professor, day + 1)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;