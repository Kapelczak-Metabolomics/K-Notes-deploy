import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, ScatterChart, Scatter, ZAxis,
} from 'recharts';
import { Loader2, ChevronRight, Download, ImageIcon, RefreshCw, Send } from 'lucide-react';
import { toPng } from 'html-to-image';
import { saveAs } from 'file-saver';

// Define graph data types
interface DataPoint {
  x: number;
  y: number;
  z?: number;
  name?: string;
}

interface GraphOptions {
  title: string;
  xLabel: string;
  yLabel: string;
  color: string;
  showGrid: boolean;
  showLegend: boolean;
  graphType: 'line' | 'bar' | 'scatter';
}

// Default data and options
const defaultData: DataPoint[] = [
  { x: 1, y: 5, name: "Point 1" },
  { x: 2, y: 7, name: "Point 2" },
  { x: 3, y: 3, name: "Point 3" },
  { x: 4, y: 8, name: "Point 4" },
  { x: 5, y: 6, name: "Point 5" },
];

const defaultOptions: GraphOptions = {
  title: "Sample Graph",
  xLabel: "X Axis",
  yLabel: "Y Axis",
  color: "#4f46e5", // indigo-600
  showGrid: true,
  showLegend: true,
  graphType: 'line',
};

export default function GraphGenerator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<DataPoint[]>(defaultData);
  const [options, setOptions] = useState<GraphOptions>(defaultOptions);
  const [dataInput, setDataInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedNote, setSelectedNote] = useState<string>('');
  const graphRef = useRef<HTMLDivElement>(null);

  // Fetch user's projects for note selection
  const { data: projects = [] } = useQuery({
    queryKey: ['/api/projects/user', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const res = await apiRequest('GET', `/api/projects/user/${user.id}`);
      return await res.json();
    },
    enabled: !!user,
  });

  // Fetch all user's project notes
  const { data: allNotes = [], isLoading: isLoadingNotes } = useQuery({
    queryKey: ['/api/notes/user', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      // First get all user projects
      const projectsRes = await apiRequest('GET', `/api/projects/user/${user.id}`);
      const userProjects = await projectsRes.json();
      
      // Then get notes for each project
      const allProjectNotes = await Promise.all(
        userProjects.map(async (project: any) => {
          const notesRes = await apiRequest('GET', `/api/notes/project/${project.id}`);
          return await notesRes.json();
        })
      );
      
      // Flatten the array of arrays into a single array of notes
      return allProjectNotes.flat();
    },
    enabled: !!user
  });

  // Initialize data input on component mount
  useEffect(() => {
    const dataString = defaultData
      .map(point => `${point.x}, ${point.y}`)
      .join('\n');
    setDataInput(dataString);
  }, []);

  // Parse data input into data points
  const parseDataInput = () => {
    try {
      const lines = dataInput.split('\n').filter(line => line.trim() !== '');
      const newData = lines.map((line, index) => {
        const [x, y] = line.split(',').map(val => parseFloat(val.trim()));
        if (isNaN(x) || isNaN(y)) {
          throw new Error(`Invalid data point at line ${index + 1}`);
        }
        return { x, y, name: `Point ${index + 1}` };
      });
      setData(newData);
    } catch (error) {
      console.error('Error parsing data:', error);
      toast({
        title: 'Data Error',
        description: error instanceof Error ? error.message : 'Failed to parse data input',
        variant: 'destructive',
      });
    }
  };

  // Handle option changes
  const updateOption = <K extends keyof GraphOptions>(key: K, value: GraphOptions[K]) => {
    setOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // Generate graph image and download
  const downloadGraph = async () => {
    if (!graphRef.current) return;
    
    try {
      setIsGenerating(true);
      const dataUrl = await toPng(graphRef.current);
      saveAs(dataUrl, `${options.title.replace(/\s+/g, '_')}_graph.png`);
      
      toast({
        title: 'Graph Downloaded',
        description: 'Your graph has been downloaded successfully.',
      });
    } catch (error) {
      console.error('Error generating graph image:', error);
      toast({
        title: 'Download Failed',
        description: 'Failed to generate graph image. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Add graph to selected note
  const addGraphToNote = async () => {
    if (!graphRef.current || !selectedNote) return;
    
    try {
      setIsGenerating(true);
      
      // Generate image data
      const dataUrl = await toPng(graphRef.current);
      
      // Get selected note
      const noteId = parseInt(selectedNote);
      const noteResponse = await apiRequest('GET', `/api/notes/${noteId}`);
      const note = await noteResponse.json();
      
      if (!note) {
        throw new Error('Selected note not found');
      }
      
      // Create a form data object for the image
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const formData = new FormData();
      formData.append('file', blob, `graph_${Date.now()}.png`);

      // Upload the graph as an attachment
      const uploadResponse = await fetch(`/api/notes/${noteId}/attachments`, {
        method: 'POST',
        body: formData,
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload graph image');
      }
      
      const attachment = await uploadResponse.json();
      
      // Update note with the graph image
      const imageTag = `<img src="/api/attachments/${attachment.id}/download" alt="${options.title}" />`;
      const updatedContent = note.content + '<p>' + imageTag + '</p>';
      
      // Save the updated note
      await apiRequest('PUT', `/api/notes/${noteId}`, {
        ...note,
        content: updatedContent,
      });
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/notes', noteId] });
      
      toast({
        title: 'Graph Added to Note',
        description: 'Your graph has been added to the selected note.',
      });
    } catch (error) {
      console.error('Error adding graph to note:', error);
      toast({
        title: 'Failed to Add Graph',
        description: 'Could not add graph to the selected note. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Render graph based on type and options
  const renderGraph = () => {
    // Default fallback graph to ensure we always return a ReactElement
    const fallbackGraph = (
      <LineChart
        width={500}
        height={300}
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <XAxis dataKey="x" />
        <YAxis />
        <Line type="monotone" dataKey="y" stroke="#cccccc" />
      </LineChart>
    );
    
    switch (options.graphType) {
      case 'line':
        return (
          <LineChart
            width={500}
            height={300}
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            {options.showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis 
              dataKey="x" 
              label={{ value: options.xLabel, position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis 
              label={{ value: options.yLabel, angle: -90, position: 'insideLeft' }}
            />
            <Tooltip />
            {options.showLegend && <Legend />}
            <Line 
              type="monotone" 
              dataKey="y" 
              stroke={options.color} 
              activeDot={{ r: 8 }}
              name={options.title}
            />
          </LineChart>
        );
        
      case 'bar':
        return (
          <BarChart
            width={500}
            height={300}
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            {options.showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis 
              dataKey="x" 
              label={{ value: options.xLabel, position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis 
              label={{ value: options.yLabel, angle: -90, position: 'insideLeft' }}
            />
            <Tooltip />
            {options.showLegend && <Legend />}
            <Bar 
              dataKey="y" 
              fill={options.color} 
              name={options.title} 
            />
          </BarChart>
        );
        
      case 'scatter':
        return (
          <ScatterChart
            width={500}
            height={300}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            {options.showGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis 
              dataKey="x" 
              type="number" 
              name={options.xLabel}
              label={{ value: options.xLabel, position: 'insideBottomRight', offset: -5 }}
            />
            <YAxis 
              dataKey="y" 
              type="number" 
              name={options.yLabel}
              label={{ value: options.yLabel, angle: -90, position: 'insideLeft' }}
            />
            <ZAxis range={[60, 60]} />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            {options.showLegend && <Legend />}
            <Scatter 
              name={options.title} 
              data={data} 
              fill={options.color} 
            />
          </ScatterChart>
        );
        
      default:
        return fallbackGraph;
    }
  };

  // All notes we get should already be the user's notes
  const userNotes = allNotes;
  
  // Log notes for debugging
  useEffect(() => {
    if (userNotes.length > 0) {
      console.log("📝 User notes available for graph generator:", userNotes);
    } else if (!isLoadingNotes) {
      console.log("📝 No user notes found for graph generator");
    }
  }, [userNotes, isLoadingNotes]);

  return (
    <div className="container py-10 px-4 sm:px-6 lg:px-8">
      <div className="space-y-6">
        <div className="flex flex-col space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Graph Generator</h1>
          <p className="text-muted-foreground">
            Create and embed customized graphs in your research notes.
          </p>
        </div>
        
        <Separator />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left panel: Controls */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Graph Data</CardTitle>
                <CardDescription>
                  Enter your data points (x, y) one per line
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Textarea
                  className="min-h-[200px] font-mono"
                  placeholder="1, 5&#10;2, 7&#10;3, 3&#10;4, 8&#10;5, 6"
                  value={dataInput}
                  onChange={(e) => setDataInput(e.target.value)}
                />
                <Button
                  className="mt-4 w-full"
                  onClick={parseDataInput}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Update Data
                </Button>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Graph Options</CardTitle>
                <CardDescription>
                  Customize your graph appearance
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Basic</TabsTrigger>
                    <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="basic" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="graphType">Graph Type</Label>
                      <Select
                        value={options.graphType}
                        onValueChange={(value) => updateOption('graphType', value as any)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select graph type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="line">Line Chart</SelectItem>
                          <SelectItem value="bar">Bar Chart</SelectItem>
                          <SelectItem value="scatter">Scatter Plot</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={options.title}
                        onChange={(e) => updateOption('title', e.target.value)}
                        placeholder="Graph Title"
                      />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="xLabel">X-Axis Label</Label>
                        <Input
                          id="xLabel"
                          value={options.xLabel}
                          onChange={(e) => updateOption('xLabel', e.target.value)}
                          placeholder="X-Axis"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="yLabel">Y-Axis Label</Label>
                        <Input
                          id="yLabel"
                          value={options.yLabel}
                          onChange={(e) => updateOption('yLabel', e.target.value)}
                          placeholder="Y-Axis"
                        />
                      </div>
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="advanced" className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="color">Color</Label>
                      <div className="flex items-center space-x-2">
                        <Input
                          id="color"
                          type="color"
                          value={options.color}
                          onChange={(e) => updateOption('color', e.target.value)}
                          className="w-12 h-8 p-1"
                        />
                        <Input
                          value={options.color}
                          onChange={(e) => updateOption('color', e.target.value)}
                          placeholder="#4f46e5"
                          className="flex-1"
                        />
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="showGrid"
                        checked={options.showGrid}
                        onChange={(e) => updateOption('showGrid', e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <Label htmlFor="showGrid">Show Grid</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="showLegend"
                        checked={options.showLegend}
                        onChange={(e) => updateOption('showLegend', e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <Label htmlFor="showLegend">Show Legend</Label>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
          
          {/* Right panel: Graph preview and actions */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{options.title || 'Graph Preview'}</CardTitle>
                <CardDescription>
                  Preview of your generated graph
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-center items-center min-h-[400px]">
                <div ref={graphRef} className="bg-white p-4 rounded-lg">
                  <ResponsiveContainer width={550} height={350}>
                    {renderGraph()}
                  </ResponsiveContainer>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button
                  variant="outline"
                  onClick={downloadGraph}
                  disabled={isGenerating}
                >
                  {isGenerating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Download Graph
                </Button>
                
                <div className="flex items-center space-x-2">
                  <Select 
                    value={selectedNote} 
                    onValueChange={setSelectedNote}
                    disabled={isGenerating}
                  >
                    <SelectTrigger className="min-w-[200px]">
                      <SelectValue placeholder="Select note..." />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingNotes ? (
                        <SelectItem value="loading" disabled>Loading notes...</SelectItem>
                      ) : userNotes.length > 0 ? (
                        userNotes.map((note: any) => (
                          <SelectItem key={note.id} value={note.id.toString()}>
                            {note.title}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No notes available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  
                  <Button
                    onClick={addGraphToNote}
                    disabled={!selectedNote || isGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Add to Note
                  </Button>
                </div>
              </CardFooter>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Help & Tips</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Data Format</h3>
                  <p className="text-sm text-muted-foreground">
                    Enter data as x, y pairs (comma separated), with one pair per line.
                    For example: 1, 5
                  </p>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Graph Types</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li className="flex items-center">
                      <ChevronRight className="h-3 w-3 mr-1" />
                      <span><strong>Line Chart:</strong> Best for trends over time or continuous data</span>
                    </li>
                    <li className="flex items-center">
                      <ChevronRight className="h-3 w-3 mr-1" />
                      <span><strong>Bar Chart:</strong> Good for comparing distinct categories</span>
                    </li>
                    <li className="flex items-center">
                      <ChevronRight className="h-3 w-3 mr-1" />
                      <span><strong>Scatter Plot:</strong> Ideal for showing correlation between variables</span>
                    </li>
                  </ul>
                </div>
                
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Adding to Notes</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a note from the dropdown, then click "Add to Note" to embed your graph.
                    The graph will be added to the end of your selected note.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}